const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  let browser;
  
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await page.type('input[type="password"]', password, { delay: 50 });
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // FUNCIÓN PARA CERRAR AVISOS (Basado en el segundo 0:34 de tu video)
    const closePopups = async () => {
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, span'));
            const closeBtn = buttons.find(b => 
                b.innerText.toLowerCase().includes('cerrar') || 
                b.innerText.toLowerCase().includes('aceptar')
            );
            if (closeBtn) closeBtn.click();
        }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
    };

    // FUNCIÓN DE CLICK SIN ESPERAR NAVEGACIÓN (Para menús desplegables 0:38)
    const simpleClick = async (text) => {
        console.log(`🖱️ Clic en: ${text}`);
        await closePopups();
        const clicked = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, li, span, b'));
            const target = elements.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.click();
                return true;
            }
            return false;
        }, text);
        if (!clicked) throw new Error(`No se encontró: ${text}`);
        await new Promise(r => setTimeout(r, 2000)); // Espera a que el menú se despliegue
    };

    // 2. NAVEGACIÓN SIGUIENDO TU VIDEO
    // "Servicios online" sí suele navegar a otra página
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    
    await simpleClick("Boletas de honorarios");
    await simpleClick("Emisor de boleta");
    await simpleClick("Emitir boleta de honorarios");
    
    // Este último paso suele ser un link real
    console.log("🖱️ Clic final: Por usuario autorizado");
    await Promise.all([
        page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes("Por usuario autorizado"));
            if (el) el.click();
        }),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // 3. SELECCIÓN EN TABLA (Basado en el segundo 0:47 de tu video)
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 3000));

    const result = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, '');
        const links = Array.from(document.querySelectorAll('table a'));
        const found = links.find(a => a.innerText.replace(/\D/g, '') === targetClean);
        
        if (found) {
            found.click();
            return { success: true };
        }
        return { success: false, text: document.body.innerText.substring(0, 500) };
    }, rutemisor);

    if (!result.success) throw new Error("RUT no hallado en tabla final.");

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    const finalUrl = page.url();
    
    await browser.close();
    res.json({ success: true, finalUrl });

  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
