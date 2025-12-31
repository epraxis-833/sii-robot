const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  console.log(`📥 Procesando solicitud para RUT: ${rutautorizado}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await page.waitForSelector('input[name*="rutcntr"]', { visible: true });
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    const loginButton = 'button[type="submit"], input[type="submit"], #bt_ingresar';
    await page.click(loginButton);
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // NUEVA FUNCIÓN: Click por texto usando Locators (Puppeteer 23+)
    const clickByText = async (text) => {
        console.log(`🖱️ Intentando click en: ${text}`);
        // Buscamos un enlace <a> que contenga el texto (sin importar mayúsculas/minúsculas)
        const element = page.locator('a').filter(el => 
            el.innerText.toLowerCase().includes(text.toLowerCase())
        ).first();

        await element.setTimeout(20000); // Esperar hasta 20 segundos
        
        await Promise.all([
            element.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);
    };

    // 2. NAVEGACIÓN PASO A PASO
    // Nota: Usamos fragmentos de texto únicos para cada paso
    await clickByText("Continuar");
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios");
    await clickByText("Emisor de boleta");
    await clickByText("Emitir boleta de honorarios");
    await clickByText("Por usuario autorizado");
    
    // 3. SELECCIONAR RUT EMISOR
    await clickByText(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log("✅ Navegación terminada exitosamente.");
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("❌ Error en el proceso:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Robot activo en puerto ${PORT}`);
});
