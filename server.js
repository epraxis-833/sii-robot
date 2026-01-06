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
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--single-process'
      ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
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
    await Promise.all([
        page.click(loginButton),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // FUNCIÓN DE CLICK ROBUSTA
    const clickByText = async (text, isOptional = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        await new Promise(r => setTimeout(r, 2500)); 

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
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 });
            } catch (e) {}
        } else if (!isOptional) {
            throw new Error(`No se encontró el elemento: ${text}`);
        }
    };

    // 2. NAVEGACIÓN PASO A PASO
    await clickByText("Continuar", true); 
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios");
    await clickByText("Emisor de boleta");
    await clickByText("Emitir boleta de honorarios");
    await clickByText("Por usuario autorizado");
    
    // 3. SELECCIÓN DE RUT EMISOR (Protección contra avisos y carga lenta)
    console.log(`🔎 Limpiando avisos y detectando tabla para: ${rutemisor}`);

    // Intentar cerrar pop-ups si existen
    await page.evaluate(() => {
        const ads = Array.from(document.querySelectorAll('button, a, span'))
            .filter(el => {
                const txt = el.innerText.toLowerCase();
                return txt === 'cerrar' || txt === 'x' || txt.includes('entendido');
            });
        ads.forEach(btn => btn.click());
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 3000));

    const finalResult = await page.evaluate((targetRut) => {
        const targetNumbers = targetRut.replace(/\D/g, '');
        
        // Buscamos en toda la página pero priorizamos elementos que parezcan RUTs
        const elements = Array.from(document.querySelectorAll('a, td, span, b'));
        
        const found = elements.find(el => {
            const elNumbers = el.innerText.replace(/\D/g, '');
            return elNumbers === targetNumbers && elNumbers.length > 0;
        });

        if (found) {
            // Si el elemento encontrado no es el link, buscamos el <a> más cercano hacia arriba
            const clickable = found.tagName === 'A' ? found : found.closest('a');
            if (clickable) {
                clickable.click();
                return { success: true };
            }
            // Si no hay link, click directo al elemento (por si tiene evento JS)
            found.click();
            return { success: true };
        }
        
        // Reporte de diagnóstico si falla
        const hasTable = document.querySelector('table') !== null;
        const pageTextSnippet = document.body.innerText.substring(0, 500).replace(/\n/g, ' ');
        return { 
            success: false, 
            debug: `Tabla: ${hasTable}. Texto inicial: ${pageTextSnippet}` 
        };
    }, rutemisor);

    if (!finalResult.success) {
        throw new Error(`RUT no encontrado. Estado: ${finalResult.debug}`);
    }

    // 4. ESPERA FINAL DE TRANSICIÓN
    console.log("⏳ Navegando a la página de emisión...");
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log("✅ Proceso completado exitosamente.");
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
