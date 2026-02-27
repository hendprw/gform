const express = require('express');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const qr = require('qr-image'); // Library QR ringan untuk PDF
const ics = require('ics');
const app = express();

app.use(express.json());

// --- KONFIGURASI EVENT (Sesuai Request) ---
const EVENT = {
    title: "Ramadhan Impact Day 2026",
    location: "Lab TIA, Teknik Informatika (Eksak lt.3)",
    dateString: "8 Maret 2026",
    timeString: "15:00 - 18:00 WIB",
    // Format tanggal untuk kalender: [Tahun, Bulan, Tanggal, Jam, Menit]
    icsDate: [2026, 3, 8, 15, 0], 
    duration: { hours: 3, minutes: 0 },
    logoUrl: "https://i.ibb.co.com/6cxn98gN/Desain-tanpa-judul-18-1.png"
};

// --- KONFIGURASI EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// --- HELPER: GENERATE PDF BUFFER ---
function generatePDFBuffer(docCallback) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        docCallback(doc);
        doc.end();
    });
}

// --- ROUTE UTAMA ---
app.post('/webhook', async (req, res) => {
    try {
        const { nama, email } = req.body;

        if (!email || !nama) {
            return res.status(400).json({ error: 'Data nama/email tidak lengkap' });
        }

        console.log(`Processing Ticket: ${nama} (${email})`);

        // 1. Buat Kode Tiket Unik
        const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const ticketCode = `RID26-${uniqueId}`;

        // 2. Generate QR Code (Buffer untuk PDF)
        const qrBuffer = qr.imageSync(ticketCode, { type: 'png', margin: 1 });
        // QR URL untuk tampilan HTML Email (pakai API publik agar ringan)
        const qrUrlPublic = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${ticketCode}`;

        // 3. Generate PDF TIKET
        const ticketPdf = await generatePDFBuffer((doc) => {
            // Background Header
            doc.rect(0, 0, 612, 250).fill('#0f172a');
            doc.rect(0, 245, 612, 5).fill('#fbbf24');
            
            // Teks Header
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica').text('OFFICIAL E-TICKET', 50, 40, { characterSpacing: 2 });
            doc.fontSize(28).font('Helvetica-Bold').text(EVENT.title.toUpperCase(), 50, 70, { width: 400 });
            
            // Ticket ID
            doc.fontSize(10).font('Helvetica').text('TICKET ID', 50, 180, { opacity: 0.7 });
            doc.fontSize(16).font('Helvetica-Bold').text(`#${ticketCode}`, 50, 195);
            
            // Box Putih Utama
            doc.roundedRect(50, 280, 512, 350, 20).fill('#ffffff');
            
            // Detail Peserta
            doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('NAMA PESERTA', 80, 310);
            doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text(nama.toUpperCase(), 80, 325);
            
            // Waktu & Lokasi
            doc.fillColor('#94a3b8').fontSize(9).text('WAKTU', 80, 375);
            doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text(`${EVENT.dateString} | ${EVENT.timeString}`, 80, 390);
            doc.fillColor('#94a3b8').fontSize(9).text('LOKASI', 80, 430);
            doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text(EVENT.location, 80, 445, { width: 300 });
            
            // Tempel QR Code
            doc.image(qrBuffer, 385, 315, { width: 140 });
        });

        // 4. Generate PDF KUITANSI (Receipt)
        const receiptPdf = await generatePDFBuffer((doc) => {
            doc.fontSize(20).font('Helvetica-Bold').text('KUITANSI PEMBAYARAN', { align: 'right' });
            doc.fontSize(10).fillColor('#64748b').text(`No: RCP-${ticketCode}`, { align: 'right' });
            doc.moveDown().moveTo(50, 120).lineTo(550, 120).stroke();
            
            doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text('DITERIMA DARI:', 50, 150);
            doc.font('Helvetica').text(nama).text(email);
            
            doc.fontSize(12).font('Helvetica-Bold').text('UNTUK ACARA:', 350, 150);
            doc.font('Helvetica').text(EVENT.title);
            
            doc.rect(50, 230, 500, 30).fill('#f1f5f9');
            doc.fillColor('#000').font('Helvetica-Bold').text('DESKRIPSI', 60, 240);
            doc.text('STATUS', 450, 240, { align: 'right', width: 100 });
            
            doc.font('Helvetica').text(`Tiket Masuk Regular`, 60, 275);
            doc.text('GRATIS / FREE', 450, 275, { align: 'right', width: 100 });
            
            doc.moveTo(50, 300).lineTo(550, 300).stroke();
            doc.fontSize(14).font('Helvetica-Bold').text('TOTAL', 250, 320);
            doc.fontSize(14).fillColor('#2563eb').text('Rp 0,-', 450, 320, { align: 'right', width: 100 });
            
            doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`Tgl: ${new Date().toLocaleDateString()}`, 50, 400);
            doc.rect(350, 450, 150, 80).stroke('#e2e8f0');
            doc.fontSize(8).text('CAP RESMI PANITIA', 350, 540, { align: 'center', width: 150 });
        });

        // 5. Generate File KALENDER (.ics)
        const icsContent = await new Promise((resolve) => {
            ics.createEvent({
                title: EVENT.title,
                description: `Halo ${nama}, ini adalah jadwal acara ${EVENT.title}.\nLokasi: ${EVENT.location}\nTiket: ${ticketCode}`,
                location: EVENT.location,
                start: EVENT.icsDate,
                duration: EVENT.duration,
                status: 'CONFIRMED',
                organizer: { name: 'Koalisi Community', email: 'no-reply@koalisi.info' }
            }, (error, value) => {
                resolve(error ? null : value);
            });
        });

        // 6. Siapkan Attachments
        const attachments = [
            { filename: `Tiket-${ticketCode}.pdf`, content: ticketPdf },
            { filename: `Kuitansi-${ticketCode}.pdf`, content: receiptPdf }
        ];
        if (icsContent) {
            attachments.push({ filename: 'Jadwal_Acara.ics', content: icsContent });
        }

        // 7. Kirim Email
        await transporter.sendMail({
            from: `"Panitia Event" <${process.env.GMAIL_USER}>`,
            to: email,
            subject: `🎟️ Tiket & Jadwal: ${EVENT.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
                    <div style="background: #0f172a; padding: 20px; text-align: center;">
                        <h2 style="color: #fff; margin:0;">Pendaftaran Berhasil!</h2>
                    </div>
                    <div style="padding: 20px;">
                        <p>Halo <strong>${nama}</strong>,</p>
                        <p>Kamu sudah terdaftar di <strong>${EVENT.title}</strong>.</p>
                        <p>📍 <strong>Lokasi:</strong> ${EVENT.location}<br>📅 <strong>Waktu:</strong> ${EVENT.dateString}, ${EVENT.timeString}</p>
                        
                        <div style="text-align: center; margin: 20px 0; padding: 10px; background: #f8fafc; border: 1px dashed #ccc;">
                            <img src="${qrUrlPublic}" alt="QR Tiket" style="width: 150px;" />
                            <p style="font-family: monospace; font-size: 18px; color: #2563eb; font-weight: bold;">${ticketCode}</p>
                            <small>Tunjukkan QR ini saat registrasi</small>
                        </div>

                        <p>📎 <strong>Lampiran:</strong> Cek PDF Tiket & Tambahkan jadwal (.ics) ke kalender kamu.</p>
                    </div>
                </div>
            `,
            attachments: attachments
        });

        res.status(200).json({ success: true, message: 'Tiket lengkap terkirim!' });

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Default Route
app.get('/', (req, res) => res.send('Server Tiket Ramadhan Impact 2026 Ready! 🚀'));

module.exports = app;