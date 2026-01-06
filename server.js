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

    // FUNCIÓN PARA ELIMINAR AVISOS BLOQUEADORES (Video 0:34)
    const clearModals = async () => {
        await page.evaluate(() => {
            const selectors = ['button.close', '.modal-footer button', '#myModal button'];
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el && el.innerText.toLowerCase().includes('cerrar')) el.click();
            });
            // Remover cualquier "backdrop" oscuro que bloquee el clic
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(b => b.remove());
        }).catch(() => {});
    };

    // FUNCIÓN DE CLIC CON RE-INTENTO (Para el acordeón del video 0:38)
    const smartClick = async (text, attempts = 5) => {
        console.log(`🖱️ Intentando encontrar: ${text}`);
        for (let i = 0; i < attempts; i++) {
            await clearModals();
            const success = await page.evaluate((t) => {
                const elements = Array.from(document.querySelectorAll('a, li, span, h4, b'));
                const target = elements.find(el => el.innerText.trim().includes(t));
                if (target) {
                    target.scrollIntoView();
                    target.click();
                    return true;
                }
                return false;
            }, text);

            if (success) {
                console.log(`✅ Click exitoso en: ${text}`);
                await new Promise(r => setTimeout(r, 1500)); // Espera para que despliegue
                return true;
            }
            await new Promise(r => setTimeout(r, 1000)); // Esperar 1 seg antes de re-intentar
        }
        throw new Error(`Fallo tras varios intentos: ${text}`);
    };

    // 2. NAVEGACIÓN DIRECTA (Siguiendo tu flujo de video)
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    
    await smartClick("Boletas de honorarios");
    await smartClick("Emisor de boleta");
    await smartClick("Emitir boleta de honorarios");
    
    // El paso final suele requerir un clic y esperar carga de página
    await smartClick("Por usuario autorizado");
    try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 });
    } catch (e) {
        console.log("Aviso: La navegación tardó más de lo esperado, continuando...");
    }

    // 3. TABLA FINAL (Video 0:47)
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 4000));

    const clicked = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, ''); // Limpiar el RUT a 196705686
        const links = Array.from(document.querySelectorAll('table a'));
        const found = links.find(a => a.innerText.replace(/\D/g, '') === targetClean);
        
        if (found) {
            found.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!clicked) throw new Error(`El RUT ${rutemisor} no aparece en la tabla de autorizados.`);

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    
    res.json({ 
        success: true, 
        finalUrl: page.url() 
    });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
