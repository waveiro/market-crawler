const puppeteer = require('puppeteer');
const cheerio = require("cheerio");
const microdata = require('node-microdata-scraper');

const {promises: fs} = require("fs");
const path = require('path');

(async () => {
    const categories = JSON.parse(await fs.readFile(path.join(__dirname, 'categories.json')));
    const urlBase = `https://www.carrefour.com.br/{{category}}?termo=:&isGrid=true&sort=relevance&page={{pageNumber}}&foodzipzone=na`;

    for ([, category] of Object.entries(categories)) {
        for (const subcategory of category.subcategories) {
            let pageNumber = 0;

            const products = [];

            while (true) {
                pageNumber++;

                const url = urlBase.replace('{{category}}', subcategory.path).replace('{{pageNumber}}', pageNumber);
                const browser = await puppeteer.launch({headless: false});

                const page = await browser.newPage();
                await page.goto(url, {waitUntil: 'networkidle2'});

                const productElements = await page.$$('[itemtype="https://schema.org/Product"]');

                if (productElements.length === 0) break;

                for (const productElement of productElements) {
                    const {product, offer, html} = await extractMicrodata(page, productElement);

                    if (offer.availability === 'InStock') {
                        if (!product.image) {
                            product.image = getImageSrc(html);
                        }

                        products.push({
                            category: category.name,
                            subcategoria: subcategory.name,
                            name: product.name,
                            image: product.image,
                            weight: extractWeigth(product.name),
                            quantity: extractQuantity(product.name),
                            price: `R$ ${offer.price}`
                        });
                    }

                }

                await browser.close();
            }

            await fs.writeFile(`${subcategory.path}.json`, JSON.stringify({
                products
            }));
        }
    }

})();

function extractWeigth(productName) {
    const matches = productName.match(/\d{1,}(,\d{1,})?( )?(g|ml|kg|litro(s)?|l|kilo(s)?|grama(s)?)/gi);
    return matches && matches[0] ? matches[0] : '';
}

function extractQuantity(productName) {
    const matches = productName.match(/\d{1,}( )?unidade(s)?/gi);
    return matches && matches[0] ? matches[0] : '';
}

async function extractMicrodata(page, productElement) {
    const html = await page.evaluate(el => el.outerHTML, productElement);

    const [productSchema, offerSchema] = JSON.parse(microdata.parse(html));

    return {
        product: productSchema.properties,
        offer: offerSchema.properties,
        html
    }
}

function getImageSrc(html) {
    const $ = cheerio.load(html);
    const img = $('img');

    if (img.attr('src')) {
        return img.attr('src');
    } else if (img.attr('data-src')) {
        return img.attr('data-src');
    }

    return '';
}
