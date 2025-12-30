const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  console.log(`📥 Solicitud recibida para RUT: ${rutautorizado}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Función para navegar por texto (Más estable para el SII)
    const clickByText = async (text) => {
        const xpath = `//a[contains(translate(., "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ", "abcdefghijklmnñopqrstuvwxyz"), "${text.toLowerCase()}")]`;
        await page.waitForXPath(xpath, { visible: true, timeout: 15000 });
        const [link] = await page.$x(xpath);
        await Promise.all([
            link.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);
    };

    // 2. NAVEGACIÓN
    await clickByText("Continuar");
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios electrónicas");
    await clickByText("Emisor de boleta de honorarios");
    await clickByText("Emitir boleta de honorarios electrónica");
    await clickByText("Por usuario autorizado con datos usados anteriormente");
    await clickByText(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("❌ Error en Railway:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CRÍTICO: Sincronización con el puerto de Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Robot escuchando en puerto ${PORT}`);
});
