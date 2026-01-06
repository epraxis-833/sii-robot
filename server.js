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
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // 2. NAVEGACIÓN DIRECTA
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });

    // FUNCIÓN DE CLIC CON RE-INTENTO Y LIMPIEZA AGRESIVA
    const retryClick = async (text, waitNav = false) => {
        console.log(`🔎 Buscando: ${text}...`);
        
        for (let i = 0; i < 5; i++) {
            // Eliminar modales y capas oscuras en cada intento (Video 0:34)
            await page.evaluate(() => {
                const elements = document.querySelectorAll('.modal, .modal-backdrop, #myModal, .fade');
                elements.forEach(el => el.remove());
                document.body.classList.remove('modal-open');
            }).catch(() => {});

            const clicked = await page.evaluate((t) => {
                const items = Array.from(document.querySelectorAll('a, li, h4, span, b, td'));
                const target = items.find(el => el.innerText.trim().includes(t));
                if (target) {
                    target.scrollIntoView();
                    target.click(); // Intento de click normal
                    // Intento de click por evento para menús rebeldes (Video 0:38)
                    target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    target.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    return true;
                }
                return false;
            }, text);

            if (clicked) {
                console.log(`✅ Clic exitoso en: ${text}`);
                if (waitNav) {
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                } else {
                    await new Promise(r => setTimeout(r, 2000)); // Espera a que el acordeón baje
                }
                return true;
            }
            await new Promise(r => setTimeout(r, 1500)); // Esperar antes de re-intentar
        }
        throw new Error(`Imposible encontrar o hacer clic en: ${text}`);
    };

    // RUTA SEGÚN TU VIDEO
    await retryClick("Boletas de honorarios");
    await retryClick("Emisor de boleta");
    await retryClick("Emitir boleta de honorarios");
    await retryClick("Por usuario autorizado", true);

    // 3. SELECCIÓN EN TABLA (Video 0:47)
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 4000));

    const finalResult = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, ''); 
        const links = Array.from(document.querySelectorAll('table a'));
        
        const match = links.find(a => a.innerText.replace(/\D/g, '') === targetClean);
        if (match) {
            match.click();
            return { success: true };
        }
        // Diagnóstico si falla
        return { 
            success: false, 
            html: document.querySelector('table') ? "Tabla presente" : "Tabla ausente",
            text: document.body.innerText.substring(0, 200)
        };
    }, rutemisor);

    if (!finalResult.success) {
        throw new Error(`RUT no hallado. Estado: ${finalResult.html}. Texto: ${finalResult.text}`);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    const urlFinal = page.url();
    await browser.close();
    res.json({ success: true, finalUrl: urlFinal });

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
