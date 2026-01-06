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
    console.log(`🚀 Iniciando navegación para emisor: ${rutemisor}`);
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // --- 1. LOGIN ---
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await page.type('input[type="password"]', password, { delay: 50 });
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    // --- FUNCIÓN DE CLICK ROBUSTA (Normaliza texto y limpia popups) ---
    const clickInteligente = async (texto) => {
        console.log(`🔎 Buscando: "${texto}"`);
        const found = await page.evaluate((t) => {
            const el = Array.from(document.querySelectorAll('a, button, span, h4'))
                      .find(e => e.innerText.replace(/\s+/g, ' ').trim().includes(t));
            if (el) { el.scrollIntoView(); el.click(); return true; }
            return false;
        }, texto);
        if (found) await new Promise(r => setTimeout(r, 4000));
        return found;
    };

    // --- 2. NAVEGACIÓN PASO A PASO ---
    await clickInteligente('Continuar'); // Opcional
    
    // Si no vemos el menú, vamos directo a la zona de Boletas
    const menuOk = await clickInteligente('Servicios online');
    if (!menuOk) await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });

    await clickInteligente('Boletas de honorarios electrónicas');
    await clickInteligente('Emisor de boleta de honorarios');
    await clickInteligente('Emitir boleta de honorarios electrónica');
    
    // Este click es el que nos lleva a la tabla de tu Imagen 3
    await clickInteligente('Por usuario autorizado con datos usados anteriormente');

    // --- 3. SELECCIÓN DEL RUT (Modo "Multi-Frame" para evitar el error []) ---
    const rutBuscado = rutemisor.includes('-') ? rutemisor : rutemisor.replace(/^(\d+)(\d)$/, '$1-$2');
    console.log(`🎯 Buscando RUT en tabla: ${rutBuscado}`);
    
    await new Promise(r => setTimeout(r, 7000)); // Espera extendida para la tabla antigua

    let rutClickado = false;
    
    // Buscamos en la página principal Y en todos los IFRAMES posibles
    const contexts = [page, ...page.frames()];
    
    for (const context of contexts) {
        if (rutClickado) break;
        
        rutClickado = await context.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            const match = links.find(a => {
                const cleanText = a.innerText.trim().replace(/\./g, '');
                const cleanTarget = target.replace(/\./g, '');
                return cleanText === cleanTarget;
            });

            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutBuscado).catch(() => false);
    }

    if (!rutClickado) {
        // Diagnóstico: ¿Qué hay en la página realmente?
        const dump = await page.evaluate(() => document.body.innerText.slice(0, 200));
        throw new Error(`RUT no encontrado. Texto visible: ${dump}...`);
    }

    // --- 4. CIERRE ---
    await new Promise(r => setTimeout(r, 5000));
    console.log("✅ Selección exitosa.");
    
    res.json({ success: true, urlActual: page.url() });
    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR CRÍTICO: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Robot activo en puerto ${PORT}`));
