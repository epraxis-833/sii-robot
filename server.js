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
    await page.setViewport({ width: 1280, height: 1024 });
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
    
    // 3. SELECCIÓN DE RUT EMISOR (Lógica de coincidencia parcial)
    console.log(`🔎 Buscando coincidencia para el RUT: ${rutemisor}`);
    
    const rutSeleccionado = await page.evaluate((targetRut) => {
        // Extraemos solo los números del RUT que buscamos
        const targetNumbers = targetRut.replace(/\D/g, '');
        
        // Buscamos TODOS los enlaces en la página
        const allLinks = Array.from(document.querySelectorAll('a'));
        
        // Buscamos el enlace cuyo texto, al quitarle todo lo que no sea número, coincida con el nuestro
        const finalLink = allLinks.find(a => {
            const linkNumbers = a.innerText.replace(/\D/g, '');
            return linkNumbers === targetNumbers && linkNumbers.length > 0;
        });

        if (finalLink) {
            finalLink.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutSeleccionado) {
        // Si falla, capturamos qué enlaces existen para diagnosticar
        const linksOnPage = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.innerText));
        console.log("🔗 Enlaces encontrados en esta página:", linksOnPage);
        throw new Error(`El emisor RUT ${rutemisor} no fue encontrado. Revisar logs para ver enlaces disponibles.`);
    }

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
