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
    console.log("🔑 Iniciando sesión...");
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // 2. IR DIRECTO A SERVICIOS ONLINE (Para evitar menús intermedios)
    console.log("📂 Navegando a Servicios Online...");
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });

    // FUNCIÓN PARA ELIMINAR CUALQUIER OBSTÁCULO (Pop-ups del video 0:34)
    const forceClear = async () => {
        await page.evaluate(() => {
            // Cerramos modales y removemos fondos oscuros
            const closeButtons = Array.from(document.querySelectorAll('button, a, .close')).filter(e => e.innerText.toLowerCase().includes('cerrar') || e.innerText === 'x');
            closeButtons.forEach(b => b.click());
            document.querySelectorAll('.modal-backdrop, .modal').forEach(m => m.remove());
            document.body.classList.remove('modal-open');
        }).catch(() => {});
    };

    // FUNCIÓN DE CLIC REFORZADA (Para el acordeón del video 0:38)
    const forceClick = async (text) => {
        console.log(`🖱️ Buscando: ${text}`);
        await forceClear();
        
        const success = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, li, h4, span, b'));
            const target = elements.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                // Usamos una combinación de clic de Mouse y evento de JavaScript
                const clickEvent = new MouseEvent('click', {view: window, bubbles: true, cancelable: true});
                target.dispatchEvent(clickEvent);
                return true;
            }
            return false;
        }, text);

        if (!success) {
            // Si falla el clic por texto, intentamos buscar si el elemento es un ID conocido del SII
            throw new Error(`No se encontró el texto: ${text}`);
        }
        await new Promise(r => setTimeout(r, 2500)); // Espera humana para el despliegue
    };

    // NAVEGACIÓN PASO A PASO SEGÚN EL VIDEO
    await forceClick("Boletas de honorarios");
    await forceClick("Emisor de boleta");
    
    // Aquí es donde fallaba: "Emitir boleta de honorarios"
    console.log("👉 Intentando abrir submenú de emisión...");
    await forceClick("Emitir boleta de honorarios");

    console.log("👉 Intentando clic final en: Por usuario autorizado");
    await Promise.all([
        forceClick("Por usuario autorizado"),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
    ]);

    // 3. SELECCIÓN EN TABLA (Video 0:47)
    console.log(`🎯 Buscando emisor numérico: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 4000));

    const rutFound = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, '');
        const links = Array.from(document.querySelectorAll('table a'));
        const match = links.find(a => a.innerText.replace(/\D/g, '') === targetClean);
        if (match) {
            match.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutFound) throw new Error(`El RUT ${rutemisor} no aparece en la lista de la tabla.`);

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    
    console.log("✅ Navegación exitosa.");
    res.json({ success: true, finalUrl: page.url() });
    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ Error detectado: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
