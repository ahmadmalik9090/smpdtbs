/**
 * Short Link SMP DTBS — v2 Bitly-like Privat
 * Halaman web: Dashboard admin untuk membuat & mengatur short link
 * Backend: Google Apps Script + Google Sheets
 *
 * SPREADSHEET (sudah diverifikasi 24 Nov 2026):
 * https://docs.google.com/spreadsheets/d/1E2Qj9cW39vlVom4e68XJDYQvNjLBn1OYwO-Q6B0_vTg/edit
 * Tab: Links | Kolom: Kode | URL Asli | Judul | Dibuat | Klik
 *
 * APPS SCRIPT PROJECT AHMAD:
 * https://script.google.com/u/0/home/projects/1j7DXs1Jc38c5j9yIHIeBYCVPYqEYNpsod21q5JypX62LmexwPTz-0t8h/edit
 *
 * CARA PASANG DARI AWAL (lengkap di PANDUAN_DEPLOY.md):
 * 1. Buka Spreadsheet di atas > Extensions > Apps Script
 *    (atau buka project di link di atas, lalu pastikan SHEET_ID di bawah ini benar)
 * 2. Tempel file Code.gs ini (ganti semua isi Code.gs bawaan)
 * 3. Tambah file HTML baru bernama "index", tempel file index.html
 * 4. Opsional tapi SANGAT disarankan untuk mode privat:
 *    Project Settings (gir) > Script Properties > tambah:
 *      ADMIN_KEY = kata sandi dashboard, contoh: dtbs-2026-aman
 *    Jika ADMIN_KEY kosong, dashboard bisa dibuka siapa pun yang tahu URL /exec.
 *    Jika ADMIN_KEY diisi, dashboard wajib login pakai kunci itu.
 *    Redirect publik s.smpdtbs.id/kode TETAP jalan tanpa login.
 * 5. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone
 * 6. Salin URL /exec, masukkan ke github-pages/index.html & 404.html,
 *    lalu atur DNS s.smpdtbs.id (lihat panduan).
 */

const SHEET_ID = "1E2Qj9cW39vlVom4e68XJDYQvNjLBn1OYwO-Q6B0_vTg";
const SHEET_NAME = "Links";
const SHORT_DOMAIN = "https://s.smpdtbs.id";

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([["Kode", "URL Asli", "Judul", "Dibuat", "Klik"]]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 5, [120, 500, 250, 180, 70]);
  }
  return sheet;
}

function getAdminKey() {
  try {
    return PropertiesService.getScriptProperties().getProperty("ADMIN_KEY") || "";
  } catch (e) {
    return "";
  }
}

/** Cek apakah dashboard butuh kunci, dan apakah kunci yang dikirim benar */
function checkAdmin(adminKey) {
  const required = getAdminKey();
  if (!required) return { ok: true, needKey: false };
  if (String(adminKey || "") === required) return { ok: true, needKey: true };
  return { ok: false, needKey: true, error: "Kunci admin salah." };
}

function verifyAdmin(adminKey) {
  return checkAdmin(adminKey);
}

function isAdminRequired() {
  return getAdminKey() !== "";
}

function generateCode(length) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < (length || 6); i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function isValidCode(code) {
  return /^[A-Za-z0-9_-]{3,30}$/.test(code);
}

function normalizeUrl(url) {
  url = (url || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

function findByCode(code) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === code) {
      return { row: i + 1, url: data[i][1], title: data[i][2], created: data[i][3], clicks: Number(data[i][4]) || 0 };
    }
  }
  return null;
}

function readAllLinks() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    rows.push({
      code: data[i][0],
      url: data[i][1],
      title: data[i][2],
      created: data[i][3] ? new Date(data[i][3]).toISOString() : "",
      clicks: Number(data[i][4]) || 0,
      short: SHORT_DOMAIN + "/" + data[i][0]
    });
  }
  rows.reverse(); // terbaru dulu
  return rows;
}

/**
 * GET:
 *  ?code=abc123              -> redirect publik ke URL asli (tanpa login)
 *  ?api=resolve&code=abc123  -> JSON {ok:true, url:"..."} untuk s.smpdtbs.id
 *  tanpa parameter           -> dashboard admin (index.html)
 */
function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.api === "resolve") {
    const code = String(params.code || "").trim();
    const found = code ? findByCode(code) : null;
    if (!found) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Kode tidak ditemukan" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try { getSheet().getRange(found.row, 5).setValue(found.clicks + 1); } catch (err) {}
    return ContentService.createTextOutput(JSON.stringify({ ok: true, url: found.url }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (params.code) {
    const code = String(params.code).trim();
    const found = findByCode(code);
    if (!found) {
      return HtmlService.createHtmlOutput(
        "<h2 style='font-family:sans-serif'>Link tidak ditemukan</h2><p style='font-family:sans-serif'>Kode <b>" + code + "</b> tidak ada di database.</p>"
      ).setTitle("Link tidak ditemukan");
    }
    try { getSheet().getRange(found.row, 5).setValue(found.clicks + 1); } catch (err) {}
    const safe = found.url.replace(/"/g, "%22");
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='0;url=" +
      safe + "'><title>Mengalihkan...</title></head><body style='font-family:sans-serif'>Mengalihkan ke <a href='" + safe + "'>" + found.url + "</a>...</body></html>";
    return HtmlService.createHtmlOutput(html).setTitle("Mengalihkan...");
  }

  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Short Link SMP DTBS — Dashboard")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* ===== Fungsi dashboard (dipanggil via google.script.run) ===== */

function createShortLink(longUrl, customCode, title, adminKey) {
  const auth = checkAdmin(adminKey);
  if (!auth.ok) return { ok: false, error: auth.error };

  const url = normalizeUrl(longUrl);
  if (!url || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
    return { ok: false, error: "URL tidak valid. Contoh: https://www.google.com" };
  }

  let code = String(customCode || "").trim();
  if (code) {
    if (!isValidCode(code)) {
      return { ok: false, error: "Kode custom hanya boleh huruf, angka, - dan _, panjang 3-30 karakter." };
    }
    if (findByCode(code)) {
      return { ok: false, error: "Kode '" + code + "' sudah dipakai. Pilih kode lain." };
    }
  } else {
    let tries = 0;
    do { code = generateCode(6); tries++; } while (findByCode(code) && tries < 20);
    if (findByCode(code)) return { ok: false, error: "Gagal membuat kode unik, coba lagi." };
  }

  getSheet().appendRow([code, url, String(title || "").trim(), new Date(), 0]);
  return { ok: true, code: code, short: SHORT_DOMAIN + "/" + code, url: url };
}

function getLinks(adminKey) {
  const auth = checkAdmin(adminKey);
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, links: readAllLinks() };
}

function getStats(adminKey) {
  const auth = checkAdmin(adminKey);
  if (!auth.ok) return { ok: false, error: auth.error };
  const links = readAllLinks();
  let totalClicks = 0;
  let top = null;
  links.forEach(function (l) {
    totalClicks += l.clicks;
    if (!top || l.clicks > top.clicks) top = l;
  });
  return { ok: true, totalLinks: links.length, totalClicks: totalClicks, top: top };
}

/** Edit judul / URL tujuan berdasarkan kode */
function updateLink(code, newUrl, newTitle, adminKey) {
  const auth = checkAdmin(adminKey);
  if (!auth.ok) return { ok: false, error: auth.error };
  const found = findByCode(String(code || "").trim());
  if (!found) return { ok: false, error: "Kode tidak ditemukan." };
  const url = normalizeUrl(newUrl);
  if (!url || !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) {
    return { ok: false, error: "URL baru tidak valid." };
  }
  const sheet = getSheet();
  sheet.getRange(found.row, 2).setValue(url);
  sheet.getRange(found.row, 3).setValue(String(newTitle || "").trim());
  return { ok: true };
}

function deleteLink(code, adminKey) {
  const auth = checkAdmin(adminKey);
  if (!auth.ok) return { ok: false, error: auth.error };
  const found = findByCode(String(code || "").trim());
  if (!found) return { ok: false, error: "Kode tidak ditemukan." };
  getSheet().deleteRow(found.row);
  return { ok: true };
}
