import * as fs from "fs";
import * as path from "path";

const fontsDir = path.resolve("public/fonts");
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

async function getFontCss() {
  const url =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  return await res.text();
}

async function run() {
  const css = await getFontCss();
  const fontFaceBlocks = css.split("@font-face");
  const latinBlocks = [];
  const seen = new Set();

  for (const block of fontFaceBlocks) {
    if (!block.trim()) continue;
    // We only want latin subset to keep payload minimal and performant
    if (block.includes("latin") && !block.includes("latin-ext")) {
      const familyMatch = block.match(/font-family:\s*['"]?([^'";]+)/);
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      if (familyMatch && weightMatch && urlMatch) {
        const familyName = familyMatch[1].trim();
        const weight = weightMatch[1].trim();
        const fontUrl = urlMatch[1];
        const key = `${familyName}-${weight}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const safeFamilySlug = familyName.replace(/\s+/g, "-").toLowerCase();
        const filename = `${safeFamilySlug}-${weight}.woff2`;
        const filePath = path.join(fontsDir, filename);

        console.log(`Downloading ${filename} from ${fontUrl}`);
        const fontRes = await fetch(fontUrl);
        const buffer = await fontRes.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        latinBlocks.push({
          family: familyName,
          weight,
          filename,
        });
      }
    }
  }

  let localCss = "/* ElétricAi Official Typography - Local WOFF2 Fonts (OFL 1.1) */\n\n";
  for (const f of latinBlocks) {
    localCss += "@font-face {\n";
    localCss += `  font-family: "${f.family}";\n`;
    localCss += "  font-style: normal;\n";
    localCss += `  font-weight: ${f.weight};\n`;
    localCss += "  font-display: swap;\n";
    localCss += `  src: url("/fonts/${f.filename}") format("woff2");\n`;
    localCss += "}\n\n";
  }

  fs.writeFileSync(path.join(fontsDir, "fonts.css"), localCss, "utf-8");

  const licenseNotice = `ElétricAi Typography Licenses:
- Space Grotesk: SIL Open Font License 1.1 (Copyright 2020 The Space Grotesk Project Authors)
- IBM Plex Sans: SIL Open Font License 1.1 (Copyright 2018 IBM Corp. with Reserved Font Name "Plex")
- IBM Plex Mono: SIL Open Font License 1.1 (Copyright 2018 IBM Corp. with Reserved Font Name "Plex")

Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software...
Full OFL text: https://openfontlicense.org/open-font-license-official-text/
`;
  fs.writeFileSync(path.join(fontsDir, "LICENSE.txt"), licenseNotice, "utf-8");

  console.log(`[SUCCESS] Downloaded ${latinBlocks.length} WOFF2 fonts and generated fonts.css + LICENSE.txt`);
}

run().catch(console.error);
