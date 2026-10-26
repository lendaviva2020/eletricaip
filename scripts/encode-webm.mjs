import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const FFMPEG_PATH = "C:\\Users\\98911\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe";
const FRAMES_DIR = path.resolve("./temp-recording-frames");
const OUTPUT_VIDEO = path.resolve("./public/media/eletricai-demo.webm");

async function main() {
  const files = fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith(".jpg")).sort();
  console.log(`Encontrados ${files.length} frames para codificação.`);

  const ffmpeg = spawn(
    FFMPEG_PATH,
    [
      "-y",
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-r", "10",
      "-i", "pipe:0",
      "-c:v", "libvpx",
      "-b:v", "1200k",
      OUTPUT_VIDEO,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );

  let written = 0;
  for (const file of files) {
    const data = fs.readFileSync(path.join(FRAMES_DIR, file));
    const ok = ffmpeg.stdin.write(data);
    if (!ok) {
      await new Promise((res) => ffmpeg.stdin.once("drain", res));
    }
    written++;
    if (written % 50 === 0) {
      console.log(`Frames enviados para codificação: ${written}/${files.length}`);
    }
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error("FFmpeg finalizou com código " + code));
    });
  });

  const stats = fs.statSync(OUTPUT_VIDEO);
  console.log("=== VÍDEO WEBM GERADO COM SUCESSO! ===");
  console.log("Arquivo:", OUTPUT_VIDEO);
  console.log("Tamanho final:", (stats.size / 1024 / 1024).toFixed(2), "MB");
}

main().catch((err) => {
  console.error("Erro na codificação:", err);
  process.exit(1);
});
