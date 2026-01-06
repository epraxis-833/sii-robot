const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  console.log(`📥 Procesando solicitud para RUT Autorizado: ${rutautorizado}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    
    // User Agent más realista para evitar bloqueos
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await page.waitForSelector('input[name*="rutcntr"]', { visible: true });
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await page.type('input[type="password"]', password, { delay: 50 });
    
    const loginButton = 'button[type="submit"], input[type="submit"], #bt_ingresar';
    await Promise.all([
        page.click(loginButton),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    const clickByText = async (text, isOptional = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        await new Promise(r => setTimeout(r, 3000)); 

        const clicked = await page.evaluate((searchText) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, b, td'));
            const target = elements.find(a => 
                a.innerText.toLowerCase().includes(searchText.toLowerCase())
            );
            if (target) {
                target.click();
                return true;
            }
            return false;
        }, text);

        if (clicked) {
            console.log(`✅ Click exitoso en: ${text}`);
            try {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
            } catch (e) {}
        } else if (!isOptional) {
            throw new Error(`No se encontró el elemento: ${text}`);
        }
    };

    // 2. NAVEGACIÓN
    await clickByText("Continuar", true); 
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios");
    await clickByText("Emisor de boleta");
    await clickByText("Emitir boleta de honorarios");
    await clickByText("Por usuario autorizado");
    
    // 3. SELECCIÓN DE RUT EMISOR (Búsqueda con formato exacto de tu tabla)
    console.log(`🎯 Buscando el RUT con formato exacto: ${rutemisor}`);

    await new Promise(r => setTimeout(r, 5000)); // Espera extra para carga de tabla

    const selectionResult = await page.evaluate((targetRut) => {
        // Formateamos el RUT para que tenga guion (ej: 196705686 -> 19670568-6)
        const clean = targetRut.replace(/[^0-9kK]/g, '');
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1);
        const formattedRut = `${body}-${dv}`; // Esto genera el 19670568-6

        // Buscamos todos los enlaces en tablas
        const links = Array.from(document.querySelectorAll('table a, a'));
        
        // Intentamos tres tipos de coincidencia:
        // 1. Con el formato de guion (19670568-6)
        // 2. Con puntos y guion (19.670.568-6)
        // 3. Solo los números
        const targetLink = links.find(a => {
            const text = a.innerText.trim();
            const textClean = text.replace(/\D/g, '');
            const targetClean = targetRut.replace(/\D/g, '');
            return text.includes(formattedRut) || textClean === targetClean;
        });

        if (targetLink) {
            targetLink.click();
            return { success: true };
        }
        
        return { 
            success: false, 
            debug: `Tabla detectada: ${document.querySelector('table') !== null}. Texto visible: ${document.body.innerText.substring(0, 200)}` 
        };
    }, rutemisor);

    if (!selectionResult.success) {
        throw new Error(`RUT no encontrado. Estado: ${selectionResult.debug}`);
    }

    // 4. FINALIZACIÓN
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log("✅ Navegación terminada.");
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("❌ Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Robot activo en puerto ${PORT}`);
});
