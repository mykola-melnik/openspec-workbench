import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function variables(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/giu)].map((match) => [match[1], match[2]]));
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const channels = rgb(hex).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const name of ["styles.css", "hub.css"]) {
  test(`${name} semantic text colors meet WCAG AA in light and dark schemes`, async () => {
    const css = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
    const lightBlock = /:root\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    const darkBlock = /@media \(prefers-color-scheme: dark\)[\s\S]*?:root\s*\{([^}]*)\}/u.exec(css)?.[1] ?? "";
    const light = variables(lightBlock);
    const dark = { ...light, ...variables(darkBlock) };
    for (const [scheme, palette] of [["light", light], ["dark", dark]]) {
      for (const foreground of ["ink", "muted", "warning"]) {
        assert.ok(contrast(palette[foreground], palette.bg) >= 4.5, `${name} ${scheme} ${foreground}`);
      }
      assert.ok(contrast(palette["on-accent"], palette.accent) >= 4.5, `${name} ${scheme} accent control`);
      if (palette.danger) assert.ok(contrast(palette.danger, palette.bg) >= 4.5, `${name} ${scheme} danger`);
    }
  });
}
