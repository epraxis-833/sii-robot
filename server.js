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

    // 2. NAVEGACIÓN DIRECTA A SERVICIOS
    console.log("📂 Navegando a Servicios Online...");
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });

    // FUNCIÓN DE CLIC INTELIGENTE (Diferencia entre menús y enlaces)
    const smartClick = async (text, waitNav = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        
        // Limpiar pop-ups del video (0:34) antes de cada clic
        await page.evaluate(() => {
            document.querySelectorAll('.modal-backdrop, .modal, #myModal').forEach(m => m.remove());
            document.body.classList.remove('modal-open');
        }).catch(() => {});

        const result = await page.evaluate((t) => {
            // Buscamos todos los elementos que contengan el texto
            const elements = Array.from(document.querySelectorAll('a, li, h4, span, b'));
            
            // Priorizamos elementos que sean visibles y tengan el texto exacto
            const target = elements.find(el => 
                el.innerText.trim() === t || el.innerText.trim().includes(t)
            );

            if (target) {
                target.scrollIntoView();
                // Simular clic real
                const clickEvent = new MouseEvent('click', {view: window, bubbles: true, cancelable: true});
                target.dispatchEvent(clickEvent);
                return true;
            }
            return false;
        }, text);

        if (!result) throw new Error(`No se encontró el texto: ${text}`);
        
        if (waitNav) {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        } else {
            await new Promise(r => setTimeout(r, 3000)); // Espera para que el acordeón abra (Video 0:38)
        }
    };

    // --- RUTA EXACTA BASADA EN TU VIDEO ---
    await smartClick("Boletas de honorarios");
    await smartClick("Emisor de boleta");
    
    // En el video, haces clic en el que abre el sub-menú (0:39)
    await smartClick("Emitir boleta de honorarios");
    
    // Ahora el clic final que cambia la página (0:41)
    await smartClick("Por usuario autorizado", true);

    // 3. SELECCIÓN EN TABLA (Video 0:47)
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 5000)); // Tiempo extra para carga de tabla

    const rutFound = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, ''); // 196705686
        const links = Array.from(document.querySelectorAll('table a'));
        
        // Buscamos el link cuyo texto numérico coincida
        const match = links.find(a => a.innerText.replace(/\D/g, '') === targetClean);
        if (match) {
            match.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutFound) {
        // Si no lo encuentra, capturamos qué hay para el log
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
        throw new Error(`RUT no hallado en tabla. Texto visible: ${bodyText}`);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    console.log("✅ Llegamos a la página final.");
    const currentUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl: currentUrl });

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ Error en Railway: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
