"""反向代理：将 /proxy/{task_id}/{path} 转发到对应 dev server 端口"""
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from ..pipeline.process_manager import process_manager

router = APIRouter(tags=["Proxy"])


@router.api_route(
    "/proxy/{task_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def proxy_http(task_id: int, path: str, request: Request):
    port = process_manager.get_port(task_id)
    if port is None:
        raise HTTPException(503, f"任务 {task_id} 的预览服务未启动")

    target_url = f"http://localhost:{port}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    body = await request.body()

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
        except httpx.ConnectError:
            raise HTTPException(503, "dev server 尚未就绪，请稍候重试")

    return StreamingResponse(
        content=iter([resp.content]),
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )


@router.get("/proxy/{task_id}", include_in_schema=False)
async def proxy_root(task_id: int, request: Request):
    return await proxy_http(task_id, "", request)
