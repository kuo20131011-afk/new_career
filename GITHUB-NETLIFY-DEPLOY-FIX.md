# V3.3.90 GitHub → Netlify 部署修正說明

本版保留 V3.3.89-A 的功能與版型，只修正部署相容性。

## 重要：GitHub Repository 結構

請把本資料夾「裡面的內容」放在 GitHub repository 根目錄，而不是再多包一層 `Career-main/`。

正確：

```
repository/
├── index.html
├── netlify.toml
├── package.json
├── js/
├── assets/
└── netlify/
    ├── functions/
    └── lib/
```

不建議：

```
repository/
└── Career-main/
    ├── index.html
    ├── netlify.toml
    └── ...
```

如果你的 GitHub repository 已經是第二種結構，請到 Netlify 的 Continuous deployment → Build settings，將 Package directory 設成 `Career-main`；Base directory 保持 repository root。或者直接把 Career-main 裡面的檔案移到 repository 根目錄。

## 本版 netlify.toml

使用目前 Netlify 建議的 Functions directory 設定：

- Publish directory: `.`
- Functions directory: `netlify/functions`
- 不需要 build command

## GitHub 自動部署

Netlify 必須已經連接到正確的 GitHub repository，而且 Production branch 必須是你實際 push 的分支（通常是 `main`）。

每次 push 到 Production branch 才會觸發 Production deploy。
