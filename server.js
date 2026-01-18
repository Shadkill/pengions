const express = require('express');
const multer = require('multer');
const path = require('path');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = 5000;
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
let crc32Table = null;
function makeCrc32Table() {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}
function calculateCrc32(str) {
  if (!crc32Table) {
    crc32Table = makeCrc32Table();
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i);
    crc = (crc >>> 8) ^ crc32Table[(crc ^ byte) & 0xFF];
  }
  crc = crc ^ 0xFFFFFFFF;
  return (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
function swapFirst8Bytes(str) {
  if (str.length < 8) {
    console.warn('Строка слишком короткая для обмена 8 байтов.');
    return str;
  }
  const first8Chars = str.substring(0, 8);
  const remainingChars = str.substring(8);
  const key = '10325476';
  const swappedBytes = [
    first8Chars[key[0]], first8Chars[key[1]],
    first8Chars[key[2]], first8Chars[key[3]],
    first8Chars[key[4]], first8Chars[key[5]],
    first8Chars[key[6]], first8Chars[key[7]],
  ];
  return swappedBytes.join('') + remainingChars;
}
function decodeBase64(base64String) {
  try {
    return Buffer.from(base64String, 'base64').toString('utf-8');
  } catch (e) {
    throw new Error(`Ошибка декодирования Base64: ${e.message}`);
  }
}
function decodeFileContent(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const decodedLines = [];
  const errors = [];
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      const parts = line.split(',');
      if (parts.length !== 2) {
        throw new Error(
          `Некорректный формат строки. Ожидалось 2 части через запятую, получено ${parts.length}`
        );
      }
      const crcPart = parts[0].trim();
      const base64Part = parts[1].trim();
      const swappedCrc = swapFirst8Bytes(crcPart);
      const swappedBase64 = swapFirst8Bytes(base64Part);
      const decodedText = decodeBase64(swappedBase64);
      const calculatedCrc = calculateCrc32(decodedText);
      const crcValid = swappedCrc === calculatedCrc;
      const decode = decodedText.replace(/,/g, ',   ')
      decodedLines.push(decode);
    } catch (e) {
      errors.push({
        lineNumber: index + 1,
        original: line,
        error: e.message,
      });
    }
  });
  return { decodedLines, errors };
}


app.get('/', (req, res) => {
  res.render('index');
});

app.post('/decode', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('Файл не был загружен');
  }
  try {
    const inputText = req.file.buffer.toString('utf-8');
    let { decodedLines } = decodeFileContent(inputText);
    if (decodedLines.length === 0) {
      return res.status(400).send('Не удалось декодировать ни одной строки файла.');
    }
    let name = decodedLines[0];
    decodedLines.shift();
    const resultText =name+ '\n' +"№,   Date,         Time,       UID,           Status\n" + decodedLines.join('\n');
    const fileName =
      'decoded_' + new Date().toISOString().slice(0, 10) + '.txt';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );
    res.send(resultText);
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .send('Ошибка при обработке файла: ' + (e && e.message ? e.message : e));
  }
});
app.listen(PORT, () => {
  console.log(`Server run`);
});