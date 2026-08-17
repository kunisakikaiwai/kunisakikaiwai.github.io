import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://kunisakikaiwai.jp';
const root = path.dirname(fileURLToPath(import.meta.url));

// sitemap から外す URL。
// - '/' は /jp/ への転送ページ（Astro が noindex 付きで生成する）
// - feel / en の walk は準備中ページ（中身が無く、Google にソフト404・重複と判定される）
// 公開したら、その URL をこのリストから消すだけでよい。
const excludedFromSitemap = [
  `${SITE}/`,
  `${SITE}/jp/feel/`,
  `${SITE}/en/feel/`,
  `${SITE}/en/walk/`,
];

// --- lastmod（最終更新日）の算出 ---------------------------------------
// 各URLの「元ファイル」の最終コミット日時を lastmod にする。
// ビルド日時を一律に入れると全ページが毎回更新扱いになり、かえって信用されないため。
// CI では .github/workflows/deploy.yml で fetch-depth: 0 を指定して履歴を取得している
// （履歴が無い環境や未コミットのファイルではファイルの更新日時にフォールバック）。

const lastModified = (file) => {
  // git にはリポジトリ相対のパスを渡す（絶対パスは Dropbox 等のパス解決違いで
  // "outside repository" と怒られることがある）
  const git = spawnSync('git', ['log', '-1', '--format=%cI', '--', path.relative(root, file)], {
    cwd: root,
    encoding: 'utf8',
  });
  const committed = git.status === 0 ? git.stdout.trim() : '';
  if (committed) return committed;
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return undefined;
  }
};

// git は "+09:00" 付き、fs は "Z" 付きの文字列を返すので、文字列比較でなく時刻で比べる
const newest = (...dates) =>
  dates.filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b)).pop();

// frontmatter の slug を読む（ページのURLはファイル名でなく slug で決まるため）
const slugOf = (file) => {
  const head = fs.readFileSync(file, 'utf8').slice(0, 600);
  return head.match(/^slug:\s*["']?([^"'\n\r]+)["']?\s*$/m)?.[1]?.trim();
};

const listFiles = (dir) => {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.md') || name.endsWith('.mdx'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
};

const buildLastmodMap = () => {
  const map = new Map();
  const src = path.join(root, 'src');

  for (const lang of ['jp', 'en']) {
    // 記事ページ: src/content/<lang>/<section>/*.md(x) → /<lang>/<section>/<slug>/
    for (const section of ['story', 'rabithole']) {
      for (const file of listFiles(path.join(src, 'content', lang, section))) {
        const slug = slugOf(file);
        if (slug) map.set(`${SITE}/${lang}/${section}/${slug}/`, lastModified(file));
      }
    }
    for (const file of listFiles(path.join(src, 'content', lang, 'community', 'blog'))) {
      const slug = slugOf(file);
      if (slug) map.set(`${SITE}/${lang}/community/blog/${slug}/`, lastModified(file));
    }

    // 本文を content から読んでいる固定ページは、ページと本文の新しいほうを採る
    const page = (...p) => path.join(src, 'pages', lang, ...p);
    const content = (...p) => path.join(src, 'content', lang, ...p);
    const pair = (url, pageFile, contentFile) => {
      const date = newest(lastModified(pageFile), lastModified(contentFile));
      if (date) map.set(url, date);
    };
    pair(`${SITE}/${lang}/`, page('index.astro'), content('00-preface.mdx'));
    pair(`${SITE}/${lang}/community/`, page('community', 'index.astro'), content('community', 'community.mdx'));
    pair(`${SITE}/${lang}/kunisakiology/`, page('kunisakiology', 'index.astro'), content('kunisakiology', 'challenge.mdx'));
  }

  // 残りの固定ページ（一覧ページなど）はページファイルそのもの
  const plain = {
    [`${SITE}/jp/story/`]: 'src/pages/jp/story/index.astro',
    [`${SITE}/en/story/`]: 'src/pages/en/story/index.astro',
    [`${SITE}/jp/walk/`]: 'src/pages/jp/walk/index.astro',
    [`${SITE}/jp/walk/long-trail/`]: 'src/pages/jp/walk/long-trail.astro',
    [`${SITE}/jp/stay/`]: 'src/pages/jp/stay/index.astro',
    [`${SITE}/en/stay/`]: 'src/pages/en/stay/index.astro',
  };
  for (const [url, rel] of Object.entries(plain)) {
    const date = lastModified(path.join(root, rel));
    if (date) map.set(url, date);
  }

  return map;
};

const lastmodByUrl = buildLastmodMap();

export default defineConfig({
  site: SITE,
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !excludedFromSitemap.includes(page) && !page.includes('/soshi-'),
      serialize: (item) => {
        const lastmod = lastmodByUrl.get(item.url);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
});
