const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// Function to set up the Puppeteer browser
async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    return { browser, page };
}

// Function to search page source for dynamic class names
async function searchDynamicClassNames(page, pattern) {
    const pageSource = await page.content();
    const matches = [...pageSource.matchAll(new RegExp(pattern, 'g'))];
    const classNames = [...new Set(matches.map(match => match[1]))];
    return classNames;
}

// Function to decode base64 image data
async function decodeBase64Image(dataUrl) {
    const buffer = Buffer.from(dataUrl, 'base64');
    const image = await Jimp.read(buffer);
    return image;
}

// Function to extract graph values from image
async function extractGraphValues(image) {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const values = [];

    for (let i = 0; i < 7; i++) {
        let x = Math.floor(i * (width / 6));
        x = x >= width ? width - 1 : x;
        let redPixels = [];
        for (let y = 0; y < height; y++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
            if (pixel.r > 150 && pixel.g < 100 && pixel.b < 100) {
                redPixels.push(y);
            }
        }
        if (redPixels.length > 0) {
            const midPixel = redPixels[Math.floor(redPixels.length / 2)];
            values.push(1 - (midPixel / height));
        } else {
            values.push(0);
        }
    }

    values.reverse();
    return values;
}

// Function to extract hashtags using dynamic class names
async function extractHashtags(page, hashtagClass, retries = 3) {
    let hashtags = [];
    let retryCount = 0;

    while (hashtags.length < 10 && retryCount < retries) {
        let elementsFound = false;
        const startTime = Date.now();

        while (!elementsFound && (Date.now() - startTime < 10000)) {
            const hashtagElements = await page.$$(hashtagClass);
            if (hashtagElements.length > 0) {
                elementsFound = true;
            }
        }

        if (!elementsFound) {
            retryCount++;
            console.log(`No hashtag elements found. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        const hashtagElements = await page.$$(hashtagClass);
        for (let element of hashtagElements) {
            const hashtag = await page.evaluate(el => el.textContent.trim(), element);
            if (!hashtags.includes(hashtag)) {
                hashtags.push(hashtag);
                if (hashtags.length >= 500) {
                    break;
                }
            }
        }

        try {
            const viewMoreButton = await page.$('.CcButton_common__aFDas.CcButton_secondary__N1HnA.index-mobile_common__E86XM');
            if (viewMoreButton) {
                await viewMoreButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw new Error("No more 'View More' buttons found");
            }
        } catch (e) {
            console.log("No more 'View More' buttons or an error occurred:", e);
            break;
        }
    }

    return hashtags.slice(0, 500);
}

// Function to scrape music data and graphs using dynamic class names
async function scrapeMusicAndGraphs(page, musicClass, authorClass, graphClass, retries = 3) {
    let musicData = [];
    let retryCount = 0;

    while (musicData.length < 500 && retryCount < retries) {
        let elementsFound = false;
        const startTime = Date.now();

        while (!elementsFound && (Date.now() - startTime < 10000)) {
            const musicElements = await page.$$(musicClass);
            const authorElements = await page.$$(authorClass);
            const graphElements = await page.$$(graphClass + ' canvas');

            if (musicElements.length > 0 && authorElements.length > 0 && graphElements.length > 0) {
                elementsFound = true;
            }
        }

        if (!elementsFound) {
            retryCount++;
            console.log(`No music elements found. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }

        const musicElements = await page.$$(musicClass);
        const authorElements = await page.$$(authorClass);
        const graphElements = await page.$$(graphClass + ' canvas');

        if (musicElements.length !== authorElements.length || musicElements.length !== graphElements.length) {
            console.log("Mismatch between number of music elements, author elements, and graph elements.");
            return musicData;
        }

        for (let i = 0; i < musicElements.length; i++) {
            const musicTitle = await page.evaluate(el => el.textContent.trim(), musicElements[i]);
            const authorName = await page.evaluate(el => el.textContent.trim(), authorElements[i]);
            const graphDataUrl = await page.evaluate(canvas => canvas.toDataURL('image/png').substring(22), graphElements[i]);

            const graphImage = await decodeBase64Image(graphDataUrl);
            const graphValues = await extractGraphValues(graphImage);

            // console.log(`Graph values for "${musicTitle}" by "${authorName}":`, graphValues); // Debug log

            const musicItem = {
                title: musicTitle,
                author: authorName,
                graph_values: graphValues
            };
            if (!musicData.some(item => item.title === musicTitle && item.author === authorName)) {
                musicData.push(musicItem);
                if (musicData.length >= 500) {
                    break;
                }
            }
        }

        try {
            const viewMoreButton = await page.$('.CcButton_common__aFDas.CcButton_secondary__N1HnA.index-mobile_common__E86XM');
            if (viewMoreButton) {
                await viewMoreButton.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                throw new Error("No more 'View More' buttons found");
            }
        } catch (e) {
            console.log("No more 'View More' buttons or an error occurred:", e);
            break;
        }
    }

    return musicData.slice(0, 500);
}

// Function to save data to a JSON file with a timestamp
function saveToJson(data, filename) {
    const timestamp = new Date().toISOString();
    const result = {
        timestamp,
        data
    };
    fs.writeFileSync(path.resolve(__dirname, filename), JSON.stringify(result, null, 4), 'utf8');
}

// Main function for scraping hashtags and music data
(async () => {
    const { browser, page } = await setupBrowser();
    const retries = 3;

    // Scrape hashtags
    let hashtagData = [];
    let retryCount = 0;

    while (hashtagData.length === 0 && retryCount < retries) {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en');
        await new Promise(resolve => setTimeout(resolve, 10000));

        const hashtagClassPattern = /class="([^"]*CardPc_titleText[^"]*)"/g;
        const hashtagClassNames = await searchDynamicClassNames(page, hashtagClassPattern);

        if (hashtagClassNames.length > 0) {
            const hashtagClass = '.' + hashtagClassNames[0].split(' ').join('.');
            console.log(`Using hashtag class: ${hashtagClass}`);
            hashtagData = await extractHashtags(page, hashtagClass);
        } else {
            retryCount++;
            console.log(`Failed to identify dynamic class names for hashtags. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`Scraped ${hashtagData.length} hashtags.`);
    if (hashtagData.length > 0) {
        saveToJson(hashtagData, 'trending_hashtags.json');
        console.log("Hashtag data saved to 'trending_hashtags.json'");
    }

    // Scrape music data and graphs
    let musicData = [];
    retryCount = 0;

    while (musicData.length === 0 && retryCount < retries) {
        await page.goto('https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en');
        await new Promise(resolve => setTimeout(resolve, 10000));

        const musicClassPattern = /class="([^"]*ItemCard_musicName[^"]*)"/g;
        const authorClassPattern = /class="([^"]*ItemCard_autherName[^"]*)"/g;
        const graphClassPattern = /class="([^"]*ItemCard_echartWrap[^"]*)"/g;

        const musicClassNames = await searchDynamicClassNames(page, musicClassPattern);
        const authorClassNames = await searchDynamicClassNames(page, authorClassPattern);
        const graphClassNames = await searchDynamicClassNames(page, graphClassPattern);

        if (musicClassNames.length > 0 && authorClassNames.length > 0 && graphClassNames.length > 0) {
            const musicClass = '.' + musicClassNames[0].split(' ').join('.');
            const authorClass = '.' + authorClassNames[0].split(' ').join('.');
            const graphClass = '.' + graphClassNames[0].split(' ').join('.');
            console.log(`Using music class: ${musicClass}`);
            console.log(`Using author class: ${authorClass}`);
            console.log(`Using graph class: ${graphClass}`);

            musicData = await scrapeMusicAndGraphs(page, musicClass, authorClass, graphClass);
        } else {
            retryCount++;
            console.log(`Failed to identify dynamic class names for music, author, and graphs. Reloading page... (Attempt ${retryCount}/${retries})`);
            await page.reload();
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log(`Scraped ${musicData.length} music items with graphs.`);
    if (musicData.length > 0) {
        saveToJson(musicData, 'trending_music.json');
        console.log("Music data saved to 'trending_music.json'");
    }

    // Close the browser
    await browser.close();
})();
