const maxSize = 15 * 1024 * 1024;
const asset = (name) => new URL('./vendor/' + name, import.meta.url).href;

export async function extractFile(file) {
  if (file.size > maxSize) throw new Error('Файл больше 15 МБ. Раздели его на части.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (/\.docx$/i.test(file.name)) return readDocx(data);
  if (/\.pdf$/i.test(file.name)) return readPdf(data);
  throw new Error('Выбери файл в формате PDF или DOCX.');
}

async function readDocx(data) {
  const { unzipSync, strFromU8 } = await import('./vendor/fflate.mjs');
  const files = unzipSync(data, { filter: ({name, originalSize}) =>
    name === 'word/document.xml' && originalSize <= maxSize });
  if (!files['word/document.xml']) throw new Error('В DOCX не удалось найти основной текст.');
  const xml = new DOMParser().parseFromString(strFromU8(files['word/document.xml']), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Не удалось прочитать документ Word.');
  function paragraph(node) {
    let result = '';
    for (const part of node.getElementsByTagName('*')) {
      if (part.localName === 't') result += part.textContent;
      if (part.localName === 'tab') result += ' | ';
      if (part.localName === 'br') result += '\n';
    }
    return result.trim();
  }
  const result = [];
  for (const p of xml.getElementsByTagNameNS('*', 'p')) {
    if (Array.from(ancestors(p)).some(el => el.localName === 'tc')) continue;
    result.push({ order: p, text: paragraph(p) });
  }
  for (const row of xml.getElementsByTagNameNS('*', 'tr')) {
    const cells = Array.from(row.children).filter(el => el.localName === 'tc');
    result.push({ order: row, text: cells.map(cell =>
      Array.from(cell.getElementsByTagNameNS('*', 'p'), paragraph).filter(Boolean).join(' ')).join(' | ') });
  }
  result.sort((a,b) => a.order.compareDocumentPosition(b.order) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  return result.map(item => item.text).join('\n');
}

function* ancestors(node) {
  for (let element = node.parentElement; element; element = element.parentElement) yield element;
}

async function readPdf(data) {
  const pdf = await import('./vendor/pdf.min.mjs');
  pdf.GlobalWorkerOptions.workerSrc = asset('pdf.worker.min.mjs');
  const task = pdf.getDocument({
    data, isEvalSupported: false, useSystemFonts: true,
    cMapUrl: asset('cmaps/'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts/')
  });
  try {
    const document = await task.promise;
    if (document.numPages > 80) throw new Error('В PDF больше 80 страниц. Раздели его на части.');
    const lines = [];
    for (let n = 1; n <= document.numPages; n += 1) {
      const page = await document.getPage(n);
      const { items } = await page.getTextContent();
      let line = '';
      let previous;
      for (const item of items) {
        if (!('str' in item)) continue;
        if (previous && Math.abs(previous.transform[5] - item.transform[5]) > 4 && item.str.trim()) {
          lines.push(line); line = ''; previous = undefined;
        }
        if (item.str) {
          const gap = previous ? item.transform[4] - previous.transform[4] - previous.width : 0;
          if (line && gap > 19) line += ' | ';
          else if (line && gap > 1.3 && !/\s$/.test(line) && !/^\s/.test(item.str)) line += ' ';
          line += item.str;
          previous = item;
        }
        if (item.hasEOL) { lines.push(line); line = ''; previous = undefined; }
      }
      if (line) lines.push(line);
      page.cleanup();
    }
    const content = lines.join('\n').trim();
    if (!content) throw new Error('В PDF нет выделяемого текста. Вставь распознанный текст или загрузи DOCX.');
    return content;
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('PDF защищён паролем. Загрузи доступную копию.');
    if (error.name === 'InvalidPDFException') throw new Error('Не удалось прочитать этот PDF.');
    throw error;
  } finally {
    await task.destroy();
  }
}
