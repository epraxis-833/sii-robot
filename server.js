const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
// Permite recibir tanto JSON como datos de formulario
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: true }));

app.post('/sii-navigate', async (req, res) => {
  // Extraemos datos asegurando compatibilidad con diferentes métodos de envío
  const { url, rutautorizado, password, rutemisor } = req.body;
  
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
    // User-Agent actualizado para evitar bloqueos del SII [cite: 16]
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. LOGIN SII
    const loginUrl = url || 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html';
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.waitForSelector('input[name*="rutcntr"]');
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Función auxiliar para navegar por texto de forma robusta
    const clickPorTexto = async (texto) => {
        const xpath = `//a[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${texto.toLowerCase()}")]`;
        await page.waitForXPath(xpath, { visible: true, timeout: 15000 });
        const [elemento] = await page.$x(xpath);
        await Promise.all([
            elemento.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);
    };

    // 2. Secuencia de navegación [cite: 18, 19, 20]
    await clickPorTexto("Continuar");
    await clickPorTexto("Servicios online");
    await clickPorTexto("Boletas de honorarios electrónicas");
    await clickPorTexto("Emisor de boleta de honorarios");
    await clickPorTexto("Emitir boleta de honorarios electrónica");
    await clickPorTexto("Por usuario autorizado con datos usados anteriormente");

    // 3. Click en RUT Emisor específico [cite: 20]
    await clickPorTexto(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    
    // Respuesta exitosa siempre en JSON
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("Error en Robot:", error.message);
    // Garantizamos que el error también sea un JSON válido para Laravel [cite: 22, 32]
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🤖 Robot SII Online en Railway'));
