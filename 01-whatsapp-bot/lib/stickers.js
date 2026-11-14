// lib/stickers.js — .sticker and .toimg using ffmpeg (called directly).
// .sticker: quoted/sent image or short video -> webp sticker (512x512).
// .toimg: quoted webp sticker -> png image.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

function run(cmd, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

function tmpFile(ext) {
  fs.mkdirSync(config.tmpDir, { recursive: true });
  return path.join(config.tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch { /* already gone */ }
  }
}

/** Find a quoted message, or the message itself, that carries media. */
function mediaMessage(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted) return quoted;
  return msg.message;
}

function mediaKind(m) {
  if (!m) return null;
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.stickerMessage) return 'sticker';
  return null;
}

/** .sticker — convert an image (or video up to 10s) into a webp sticker. */
async function toSticker(msg) {
  const media = mediaMessage(msg);
  const kind = mediaKind(media);
  if (kind !== 'image' && kind !== 'video') {
    throw new Error('Send or reply to an image (or a short video) with .sticker');
  }
  if (kind === 'video' && (media.videoMessage.seconds || 0) > 10) {
    throw new Error('Video is too long for a sticker — keep it under 10 seconds.');
  }
  const buffer = await downloadMediaMessage(
    { key: msg.key, message: media },
    'buffer',
    {}
  );
  const input = tmpFile(kind === 'video' ? 'mp4' : 'jpg');
  const output = tmpFile('webp');
  fs.writeFileSync(input, buffer);
  try {
    await run('ffmpeg', [
      '-y', '-i', input,
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-lossless', '0', '-compression_level', '6', '-q:v', '80',
      '-loop', '0', '-preset', 'picture',
      '-an', '-vsync', '0',
      output
    ]);
    const webp = fs.readFileSync(output);
    return { webp, isVideo: kind === 'video' };
  } finally {
    cleanup(input, output);
  }
}

/** .toimg — convert a quoted webp sticker back into a png image. */
async function stickerToImage(msg) {
  const media = mediaMessage(msg);
  if (mediaKind(media) !== 'sticker') {
    throw new Error('Reply to a sticker with .toimg to convert it back to an image.');
  }
  const buffer = await downloadMediaMessage(
    { key: msg.key, message: media },
    'buffer',
    {}
  );
  const input = tmpFile('webp');
  const output = tmpFile('png');
  fs.writeFileSync(input, buffer);
  try {
    await run('ffmpeg', ['-y', '-i', input, output]);
    return fs.readFileSync(output);
  } finally {
    cleanup(input, output);
  }
}

module.exports = { toSticker, stickerToImage, mediaMessage, mediaKind };
