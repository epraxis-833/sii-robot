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
    // Definimos un tamaño de pantalla estándar para evitar elementos ocultos
    await page.setViewport({ width: 1280, height: 900 });
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

    // FUNCIÓN DE CLICK ROBUSTA POR TEXTO
    const clickByText = async (text, isOptional = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        await new Promise(r => setTimeout(r, 2000)); 

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
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            } catch (e) {}
        } else if (!isOptional) {
            throw new Error(`No se encontró el enlace con texto: ${text}`);
        }
    };

    // 2. NAVEGACIÓN PASO A PASO
    await clickByText("Continuar", true); 
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios");
    await clickByText("Emisor de boleta");
    await clickByText("Emitir boleta de honorarios");
    await clickByText("Por usuario autorizado");
    
    // 3. SELECCIÓN DE RUT EMISOR (Optimizado para la tabla SII)
    console.log(`🔎 Buscando RUT Emisor en tabla: ${rutemisor}`);
    
    const rutSeleccionado = await page.evaluate((targetRut) => {
        // Normalizamos el RUT buscado: solo números y 'k'
        const cleanTarget = targetRut.replace(/[^0-9kK]/g, '').toLowerCase();
        
        // Buscamos específicamente enlaces <a> que suelen estar dentro de la tabla
        const links = Array.from(document.querySelectorAll('table a, table td a'));
        
        const targetLink = links.find(a => {
            const cleanText = a.innerText.replace(/[^0-9kK]/g, '').toLowerCase();
            return cleanText === cleanTarget;
        });

        if (targetLink) {
            targetLink.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutSeleccionado) {
        throw new Error(`El RUT emisor ${rutemisor} no fue encontrado en la tabla de autorizados.`);
    }

    // Espera final para llegar a la página de la boleta
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log("✅ Proceso completado.");
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
