# Liquid Glass Todo

纯静态 Todo 页面（HTML / CSS / JS），本地存储，含 Liquid Glass 风格界面、提醒与截止时间、编辑与删除撤销。

## 本地预览

在项目目录执行：

```bash
python -m http.server 5173 --bind 127.0.0.1
```

浏览器打开：<http://127.0.0.1:5173/>

或直接双击打开 `index.html`（部分浏览器对 `file://` 下本地存储有限制，建议用本地服务器）。

## 上传到 GitHub

1. 在 GitHub 上新建一个空仓库（不要勾选 README / .gitignore / license，避免首次推送冲突）。
2. 在本仓库根目录执行：

```bash
git init
git add .
git commit -m "Initial commit: Liquid Glass Todo"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

若已安装 [GitHub CLI](https://cli.github.com/)，也可在登录后执行 `gh repo create <仓库名> --public --source=. --push`。

SSH 远程地址请把 `https://github.com/...` 换成 `git@github.com:用户名/仓库名.git`。
