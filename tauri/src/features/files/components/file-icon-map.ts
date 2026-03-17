/**
 * Ayu theme file icon mapping
 * Maps file extensions and special file names to icon files in /file-icons/
 */

// Extension → icon file name (without path prefix)
const EXT_ICON_MAP: Record<string, string> = {
  // Languages
  ts: 'file_type_typescript.svg',
  tsx: 'file_type_typescript.svg',
  mts: 'file_type_typescript.svg',
  js: 'file_type_js.svg',
  mjs: 'file_type_js.svg',
  jsx: 'file_type_jsx@2x.png',
  py: 'file_type_python.svg',
  pyw: 'file_type_python.svg',
  rs: 'file_type_rust.svg',
  go: 'file_type_go.svg',
  java: 'file_type_java.svg',
  kt: 'file_type_kotlin.svg',
  kts: 'file_type_kotlin.svg',
  c: 'file_type_c.svg',
  h: 'file_type_c.svg',
  cpp: 'file_type_cpp.svg',
  cc: 'file_type_cpp.svg',
  cxx: 'file_type_cpp.svg',
  hpp: 'file_type_cpp.svg',
  cs: 'file_type_csharp.svg',
  rb: 'file_type_ruby.svg',
  php: 'file_type_php.svg',
  swift: 'file_type_swift.svg',
  dart: 'file_type_dart.svg',
  lua: 'file_type_lua@2x.png',
  perl: 'file_type_perl.svg',
  pl: 'file_type_perl.svg',
  r: 'file_type_R@2x.png',
  scala: 'file_type_scala@2x.png',
  ex: 'file_type_ex@2x.png',
  exs: 'file_type_ex@2x.png',
  erl: 'file_type_erlang@2x.png',
  hs: 'file_type_haskell.svg',
  elm: 'file_type_elm@2x.png',
  clj: 'file_type_clojure@2x.png',
  cljs: 'file_type_clojure@2x.png',
  jl: 'file_type_julia@2x.png',
  ml: 'file_type_ocaml@2x.png',
  groovy: 'file_type_groovy.svg',
  coffee: 'file_type_coffeescript@2x.png',

  // Web
  html: 'file_type_html@2x.png',
  htm: 'file_type_html@2x.png',
  css: 'file_type_css.svg',
  scss: 'file_type_scss.svg',
  sass: 'file_type_sass.svg',
  less: 'file_type_less@2x.png',
  styl: 'file_type_stylus@2x.png',
  vue: 'file_type_vue.svg',
  svelte: 'file_type_svelte.svg',
  pug: 'file_type_pug@2x.png',

  // Data / Config
  json: 'file_type_json.svg',
  yaml: 'file_type_yaml.svg',
  yml: 'file_type_yaml.svg',
  toml: 'file_type_toml.svg',
  csv: 'file_type_csv.svg',
  xml: 'file_type_default.svg',
  sql: 'file_type_sql@2x.png',
  sqlite: 'file_type_sql@2x.png',
  graphql: 'file_type_gql.svg',
  gql: 'file_type_gql.svg',

  // Markup / Docs
  md: 'file_type_markdown.svg',
  markdown: 'file_type_markdown.svg',
  tex: 'file_type_tex@2x.png',
  txt: 'file_type_text@2x.png',
  pdf: 'file_type_pdf@2x.png',

  // Shell / Scripts
  sh: 'file_type_shell.svg',
  bash: 'file_type_shell.svg',
  zsh: 'file_type_shell.svg',
  fish: 'file_type_shell.svg',
  bat: 'file_type_shell.svg',
  cmd: 'file_type_shell.svg',
  ps1: 'file_type_powershell@2x.png',

  // Images
  svg: 'file_type_image.svg',
  png: 'file_type_image.svg',
  jpg: 'file_type_image.svg',
  jpeg: 'file_type_image.svg',
  gif: 'file_type_image.svg',
  ico: 'file_type_image.svg',
  webp: 'file_type_image.svg',
  bmp: 'file_type_image.svg',
  avif: 'file_type_image.svg',

  // Fonts
  ttf: 'file_type_font.svg',
  otf: 'file_type_font.svg',
  woff: 'file_type_font.svg',
  woff2: 'file_type_font.svg',
  eot: 'file_type_font.svg',

  // Media
  mp3: 'file_type_audio@2x.png',
  wav: 'file_type_audio@2x.png',
  ogg: 'file_type_audio@2x.png',
  flac: 'file_type_audio@2x.png',
  aac: 'file_type_audio@2x.png',
  mp4: 'file_type_video@2x.png',
  avi: 'file_type_video@2x.png',
  mov: 'file_type_video@2x.png',
  mkv: 'file_type_video@2x.png',
  webm: 'file_type_video@2x.png',

  // Archives
  zip: 'file_type_archive@2x.png',
  tar: 'file_type_archive@2x.png',
  gz: 'file_type_archive@2x.png',
  rar: 'file_type_archive@2x.png',
  '7z': 'file_type_archive@2x.png',
  bz2: 'file_type_archive@2x.png',
  xz: 'file_type_archive@2x.png',

  // Binary
  exe: 'file_type_binary.svg',
  dll: 'file_type_binary.svg',
  so: 'file_type_binary.svg',
  o: 'file_type_binary.svg',
  bin: 'file_type_binary.svg',
  wasm: 'file_type_wasm.svg',

  // Jupyter
  ipynb: 'file_type_jupyter.svg',

  // Git
  gitignore: 'file_type_git.svg',
  gitattributes: 'file_type_git.svg',
  gitmodules: 'file_type_git.svg',

  // Misc
  log: 'file_type_log@2x.png',
  lock: 'file_type_lock@2x.png',
  psd: 'file_type_psd@2x.png',
  sketch: 'file_type_sketch.svg',
  vim: 'file_type_vim@2x.png',
  vimrc: 'file_type_vim@2x.png',
  dot: 'file_type_graphviz.svg',
  gv: 'file_type_graphviz.svg',

  // Office
  doc: 'file_type_word@2x.png',
  docx: 'file_type_word@2x.png',
  xls: 'file_type_excel@2x.png',
  xlsx: 'file_type_excel@2x.png',
  ppt: 'file_type_powerpoint@2x.png',
  pptx: 'file_type_powerpoint@2x.png',

  // Docker
  dockerignore: 'file_type_docker@2x.png',
}

// Special file names → icon file name
const NAME_ICON_MAP: Record<string, string> = {
  'package.json': 'file_type_npm.svg',
  'package-lock.json': 'file_type_npm.svg',
  '.npmignore': 'file_type_npm.svg',
  'tsconfig.json': 'file_type_typescript.svg',
  'Cargo.toml': 'file_type_cargo.svg',
  'Cargo.lock': 'file_type_cargo.svg',
  'Dockerfile': 'file_type_docker@2x.png',
  'dockerfile': 'file_type_docker@2x.png',
  'docker-compose.yml': 'file_type_docker@2x.png',
  'docker-compose.yaml': 'file_type_docker@2x.png',
  '.gitignore': 'file_type_git.svg',
  '.gitattributes': 'file_type_git.svg',
  '.editorconfig': 'file_type_editorconfig@2x.png',
  '.prettierrc': 'file_type_prettier.svg',
  '.prettierrc.js': 'file_type_prettier.svg',
  '.prettierrc.json': 'file_type_prettier.svg',
  '.prettierrc.yaml': 'file_type_prettier.svg',
  '.prettierrc.yml': 'file_type_prettier.svg',
  '.eslintrc': 'file_type_eslint@2x.png',
  '.eslintrc.js': 'file_type_eslint@2x.png',
  '.eslintrc.json': 'file_type_eslint@2x.png',
  '.eslintrc.yaml': 'file_type_eslint@2x.png',
  '.eslintrc.yml': 'file_type_eslint@2x.png',
  'eslint.config.js': 'file_type_eslint@2x.png',
  'eslint.config.mjs': 'file_type_eslint@2x.png',
  'eslint.config.ts': 'file_type_eslint@2x.png',
  '.babelrc': 'file_type_babel@2x.png',
  'babel.config.js': 'file_type_babel@2x.png',
  'tailwind.config.js': 'file_type_tailwind.svg',
  'tailwind.config.ts': 'file_type_tailwind.svg',
  'tailwind.config.css': 'file_type_tailwind.svg',
  'webpack.config.js': 'file_type_webpack@2x.png',
  'webpack.config.ts': 'file_type_webpack@2x.png',
  'rollup.config.js': 'file_type_rollup.svg',
  'rollup.config.mjs': 'file_type_rollup.svg',
  'rollup.config.ts': 'file_type_rollup.svg',
  'vite.config.ts': 'file_type_js.svg',
  'vite.config.js': 'file_type_js.svg',
  'yarn.lock': 'file_type_yarn@2x.png',
  '.yarnrc': 'file_type_yarn@2x.png',
  '.yarnrc.yml': 'file_type_yarn@2x.png',
  'pnpm-lock.yaml': 'file_type_npm.svg',
  'LICENSE': 'file_type_license.svg',
  'LICENSE.md': 'file_type_license.svg',
  'license': 'file_type_license.svg',
  'Makefile': 'file_type_settings@2x.png',
  'makefile': 'file_type_settings@2x.png',
  'Procfile': 'file_type_procfile.svg',
  '.nvmrc': 'file_type_nodejs@2x.png',
  '.node-version': 'file_type_nodejs@2x.png',
  'TODO': 'file_type_todo@2x.png',
  'TODO.md': 'file_type_todo@2x.png',
  'nginx.conf': 'file_type_nginx@2x.png',
  '.travis.yml': 'file_type_settings@2x.png',
}

const ICON_BASE = '/file-icons/'
const DEFAULT_FILE_ICON = 'file_type_default.svg'
const FOLDER_ICON = 'folder_dark@2x.png'
const FOLDER_OPEN_ICON = 'folder_opened_dark@2x.png'

export function getFileIconPath(name: string, isDir: boolean, isExpanded = false): string {
  if (isDir) {
    return ICON_BASE + (isExpanded ? FOLDER_OPEN_ICON : FOLDER_ICON)
  }

  // Check exact file name match first (higher priority)
  const nameIcon = NAME_ICON_MAP[name]
  if (nameIcon) {
    return ICON_BASE + nameIcon
  }

  // Check by extension
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const extIcon = EXT_ICON_MAP[ext]
  if (extIcon) {
    return ICON_BASE + extIcon
  }

  return ICON_BASE + DEFAULT_FILE_ICON
}
