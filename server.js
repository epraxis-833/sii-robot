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
    console.log(`🚀 Iniciando proceso para emisor: ${rutemisor}`);
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // --- FUNCIÓN PARA DETECTAR EXPULSIÓN (LOGIN TRAP) ---
    const checkSession = async (paso) => {
        const text = await page.evaluate(() => document.body.innerText);
        if (text.includes("Ingresar a Mi Sii") || text.includes("Clave Tributaria")) {
            throw new Error(`SESIÓN PERDIDA en [${paso}]. El SII nos devolvió al login.`);
        }
    };

    // --- 1. LOGIN MANUALMENTE LENTO ---
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 150 });
    await page.type('input[type="password"]', password, { delay: 150 });
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle0' })
    ]);
    console.log("✅ Login exitoso");

    // --- 2. NAVEGACIÓN POR CLICKS DE SEGURIDAD ---
    const menuPasos = [
        'Servicios online',
        'Boletas de honorarios electrónicas',
        'Emisor de boleta de honorarios',
        'Emitir boleta de honorarios electrónica',
        'Por usuario autorizado con datos usados anteriormente'
    ];

    for (const paso of menuPasos) {
        console.log(`🖱️ Intentando click en: ${paso}`);
        await new Promise(r => setTimeout(r, 3000)); // Pausa humana
        await checkSession(paso);

        const clickExitoso = await page.evaluate((t) => {
            // Buscamos enlaces o elementos de menú (h4, a, span)
            const targets = Array.from(document.querySelectorAll('a, h4, span, li'))
                                 .filter(el => el.innerText.trim().includes(t));
            
            if (targets.length > 0) {
                // Si es un menú colapsable (h4), hacemos click para expandir
                const el = targets[targets.length - 1]; // Usamos el último encontrado (suele ser el más específico)
                el.scrollIntoView();
                el.click();
                return true;
            }
            return false;
        }, paso);

        if (!clickExitoso) {
            console.log(`⚠️ No se halló el texto "${paso}", verificando si ya estamos en la página...`);
        }
        
        // Esperamos a que la red se calme después de cada click
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 }).catch(() => {});
    }

    // --- 3. SELECCIÓN EN TABLA (MODO FRAME-HUNTER) ---
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 6000));
    
    let rutEncontrado = false;
    // Buscamos en la página y en todos los marcos (iframes)
    const frames = [page, ...page.frames()];
    const rutLimpio = rutemisor.replace(/\D/g, '');

    for (const frame of frames) {
        rutEncontrado = await frame.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('a'));
            const match = links.find(a => a.innerText.replace(/\D/g, '') === target);
            if (match) { match.click(); return true; }
            return false;
        }, rutLimpio).catch(() => false);
        
        if (rutEncontrado) break;
    }

    if (!rutEncontrado) throw new Error("No se pudo localizar el RUT en la tabla de emisores autorizados.");

    // --- 4. VERIFICACIÓN FINAL ---
    await new Promise(r => setTimeout(r, 4000));
    console.log("✅ Navegación finalizada con éxito.");
    
    res.json({ success: true, url: page.url() });
    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
