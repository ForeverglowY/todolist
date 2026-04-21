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
git remote add origin https://github.com/ForeverglowY/todolist.git
git push -u origin main
```

本仓库已设置 `origin` 为：<https://github.com/ForeverglowY/todolist>。若尚未在网页上创建同名空仓库，请先创建后再执行 `git push`。

若已安装 [GitHub CLI](https://cli.github.com/) 且已登录，也可在仓库目录执行：`gh repo create todolist --public --source=. --remote=origin --push`（若已存在 `origin`，需先 `git remote remove origin` 再执行，或改用网页创建）。

SSH 远程：`git@github.com:ForeverglowY/todolist.git`
