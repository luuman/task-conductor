#!/bin/bash
export no_proxy=localhost,127.0.0.1
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

pkill -f "remote-debugging" 2>/dev/null
sleep 1

google-chrome --headless=new --no-sandbox --disable-gpu --no-proxy-server \
  --remote-debugging-port=9226 --remote-allow-origins=* \
  --window-size=1440,900 about:blank &
CPID=$!
sleep 3

/home/sichengli/anaconda3/bin/python3 -c "
import sys
sys.path.insert(0, '/home/sichengli/.local/lib/python3.11/site-packages')
import json, time, urllib.request, base64
from websocket import create_connection

handler = urllib.request.ProxyHandler({})
opener = urllib.request.build_opener(handler)
resp = opener.open('http://127.0.0.1:9226/json')
tabs = json.loads(resp.read())
ws = create_connection(tabs[0]['webSocketDebuggerUrl'])
n = [0]
def cmd(m, p=None):
    n[0] += 1
    msg = {'id': n[0], 'method': m}
    if p: msg['params'] = p
    ws.send(json.dumps(msg))
    for _ in range(100):
        r = json.loads(ws.recv())
        if r.get('id') == n[0]: return r

cmd('Page.enable')
cmd('Page.navigate', {'url': 'http://localhost:7071/#/login'})
time.sleep(4)
token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZ2VudCIsImV4cCI6MTgwNTIwMTk4Nn0.-5Roji-U5jNX1qUsLXqc3fD8f2A3mETOVOkodQR4Dos'
cmd('Runtime.evaluate', {'expression': \"localStorage.setItem('tc_token', '\" + token + \"')\"})
cmd('Page.navigate', {'url': 'http://localhost:7071/#/'})
time.sleep(6)
r = cmd('Runtime.evaluate', {'expression': 'document.title + \" | \" + window.location.href'})
print('Page:', r.get('result',{}).get('result',{}).get('value','?'))
result = cmd('Page.captureScreenshot', {'format': 'png'})
data = base64.b64decode(result['result']['data'])
open('/home/sichengli/Documents/code2/task-conductor/tauri-dashboard.png','wb').write(data)
print('Saved: %d bytes' % len(data))
ws.close()
"

kill $CPID 2>/dev/null
echo "DONE"
