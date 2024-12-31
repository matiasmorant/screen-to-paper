const { PDFDocument } = window.PDFLib;
const pdfjsLib = window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

async function getImageData(pdfBytes,i){
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    const page = await pdf.getPage(i+1); // pdfjslib is 1-indexed
    const pageWidth = page.getViewport({scale: 1}).width;
    const pageHeight = page.getViewport({scale: 1}).height;
    const viewport = page.getViewport({scale: 0.1});

    // Create a new canvas element
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = viewport.width;
    previewCanvas.height = viewport.height;

    // Prepare the canvas for rendering
    const context = previewCanvas.getContext('2d');

    // Render the PDF page to the canvas
    await page.render({ canvasContext: context, viewport: viewport }).promise;

    // Convert canvas to PNG and trigger download
    const ret = {
        data: context.getImageData(0, 0, previewCanvas.width, previewCanvas.height).data,
        canvaswidth: previewCanvas.width,
        canvasheight: previewCanvas.height,
        pageWidth,
        pageHeight
    };
    previewCanvas.remove();
    return ret;

}

async function getTextArea(pdfBytes,i) {
    const {data, canvaswidth, canvasheight, pageWidth, pageHeight} = await getImageData(pdfBytes,i);
    const findRange=l=>{const m=Math.max.apply(null, l); l.forEach((x,i)=>{l[i]=x/m;});return[Math.max(0,(l.findIndex(x=>x>0.1)-0.4)/l.length),Math.min(1,(l.findLastIndex(x=>x>0.1)+1+0.4)/l.length)]};

    const rowSum = new Array(canvasheight).fill(0);
    for (let hi = 0; hi < canvasheight; hi += 1) {
        for (let i = hi*canvaswidth*4; i < (hi+1)*canvaswidth*4; i += 4) {
            rowSum[hi] += (255*3)-(data[i]+data[i+1]+data[i+2]);
        }
    }
    const [y0,y1] = findRange(rowSum).map(x=>x*pageHeight);

    const columnSum = new Array(canvaswidth).fill(0);
    for (let wi = 0; wi < canvaswidth; wi += 1) {
        for (let i = wi*4; i < data.length; i += canvaswidth*4) {
            columnSum[wi] += (255*3)-(data[i]+data[i+1]+data[i+2]);
        }
    }
    const [x0, x1] = findRange(columnSum).map(x=>x*pageWidth);

    return [x0, x1, pageHeight-y1, pageHeight-y0]; // y coords reversed because canvas is top down and pdf is bottom up
};
async function addPage(pdf, page){
    if(!page) return;
    const {width, height} = page.getSize();
    const newPage = pdf.addPage([width, height]);
    const embeddedPage = await pdf.embedPage(page);
    newPage.drawPage(embeddedPage, {x: 0, y: 0, width, height});
}
async function collage(size, pages, ops){
    if (pages.every(x=>!x)) return null;
    const newPdfDoc = await PDFDocument.create();
    const newPage = newPdfDoc.addPage(size);
    for (let i = 0; i < pages.length; i += 1) {
        if (pages[i]) {
            const embeddedPage = await newPdfDoc.embedPage(pages[i]);
            newPage.drawPage(embeddedPage, ops[i]);
        }
    }
    await newPdfDoc.save();
    return newPage;
}
async function cropPdfPage(page, x0, x1, y0, y1) {
    if (!page) return null;
    const { width, height } = page.getSize();
    const k = Math.max((x1-x0)/width, (y1-y0)/height);
    if(k===1) return page;
    return collage([width*k, height*k], [page], [{
        x: (width*k-(x1-x0))/(width-(x1-x0))*x0-x0, // Negative to shift the content left
        y: (height*k-(y1-y0))/(height-(y1-y0))*y0-y0, // Negative to shift the content down
        width: width, // Keep the original width
        height: height // Keep the original height
    }]);
}
async function addMargin(page, margin){
    if (!page) return null;
    const {width, height} = page.getSize();
    return collage([width, height],[page], [{
        x: margin,
        y: margin,
        width: width-margin*2,
        height: height-margin*2,
    }])
}

async function bookscale(inputPdfBytes, shrink = 2, isBook = true, reduceGaps = false) {
    const inputPdf = await PDFDocument.load(inputPdfBytes);
    const outputPdf = await PDFDocument.create();
    const inpages = inputPdf.getPages();
    const N = inpages.length;
    const [nw,nh] = [595.28, 841.89];  // A4 size in points

    const Ne = N + ((shrink * 2) - N % (shrink * 2)) % (shrink * 2);
    const nN = Ne / shrink;

    function getPage(i) {return i < N ? inpages[i] : null;}

    let indicesFunc, transformFunc;

    if (shrink === 2) {
        indicesFunc = (i) => [Ne-1-i, i];
        transformFunc = (i) => {
            const offsets = [
                [[0,   1], [0, 0.5]],
                [[1, 0.5], [1, 0  ]]
            ][i%2];
            return offsets.map(([x,y]) => ({rotation: i%2===0?-90:90, subwidth: nh/2, subheight: nw, offsetX: x, offsetY: y }));
        };
    }

    if (shrink === 4) {
        indicesFunc = (i) => {
            const l = [Ne-1-i, nN*3-1-i, i, nN+i];
            if (i%2===1) return [l[2], l[3], l[0], l[1]];
            return l;
        };
        transformFunc = (i) => {
            const offsetX = [0, 0, 0.5, 0.5];
            const offsetY = [0.5, 0, 0.5, 0];
            return offsetX.map((x, i) => ({ rotation: 0, subwidth: nw/2, subheight: nh/2, offsetX: x, offsetY: offsetY[i] }));
        };
    }

    if (shrink === 8) {
        const pdf4 = await bookscale(inputPdfBytes, 4, false, reduceGaps);
        return await bookscale(pdf4, 2, isBook, false);
    }

    if (!isBook) {
        indicesFunc = (i) => Array.from({length: shrink}, (_, x) => shrink * i + x);
        const trans0 = transformFunc(0);
        transformFunc = (i) => trans0;
    }

    const transform=(i)=>{
        return transformFunc(i).map(x=>{
            const { rotation, subwidth, subheight, offsetX, offsetY }=x;
            return{
                x: offsetX * nw,
                y: offsetY * nh,
                width: subwidth,
                height: subheight,
                rotate: PDFLib.degrees(rotation)
            }
        })
    }
    for (let i = 0; i < nN; i++) {
        const indices = indicesFunc(i);
        const trans = transform(i);
        const pages = await Promise.all(indices.map(async j=>{
            let p = getPage(j);
            if (reduceGaps && p) {
                const [x0,x1,y0,y1] = await getTextArea(inputPdfBytes, j);
                p = await cropPdfPage(p, x0, x1, y0, y1);
            }
            return p;
        }));
        let newPage = await collage([nw, nh], pages, trans);
        if (reduceGaps){ newPage = await addMargin(newPage, 5) }
        addPage(outputPdf, newPage);
        const progress = Math.floor((i+1)/nN*100);
        document.getElementById('progressBar').value = progress;
        document.getElementById('progressContainer').style.display = 'block';
    }

    return await outputPdf.save();
}

document.getElementById('submitBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const shrinkFactor = document.getElementById('shrinkFactor').value;
    const isBook = document.getElementById('layoutToggle').checked;
    const reduceGaps = document.getElementById('reduceGapsCheckbox').checked;

    if (!fileInput.files.length) {
        alert('Please select a PDF file');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const inputPdfBytes = e.target.result;
            const processedPdfBytes = await bookscale(inputPdfBytes, parseInt(shrinkFactor), isBook, reduceGaps);

            const blob = new Blob([processedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = url;
            link.download = `paper${isBook?'B':'S'}${shrinkFactor}-${file.name}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the URL object
            URL.revokeObjectURL(url);
            document.getElementById('progressContainer').style.display = 'none';
        } catch (error) {
            console.error('Error processing PDF:', error);
            alert('Error processing PDF');
        }
    };

    reader.readAsArrayBuffer(file);
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0].name;
    const fileLabel = document.querySelector('.file-label');
    const fileNameSpan = document.querySelector('.file-name');

    fileLabel.textContent = 'Selected file:';
    fileNameSpan.textContent = fileName;

    document.getElementById('submitBtn').disabled = false;
});

document.addEventListener('DOMContentLoaded', () => {
    const layoutToggle = document.getElementById('layoutToggle');
    const simpleLabel = document.getElementById('simpleLabel');
    const bookLabel = document.getElementById('bookLabel');

    function updateLabels() {
        if (layoutToggle.checked) {
            simpleLabel.classList.remove('active');
            bookLabel.classList.add('active');
        } else {
            simpleLabel.classList.add('active');
            bookLabel.classList.remove('active');
        }
    }

    // Initial setup
    updateLabels();

    // Add event listener for toggle changes
    layoutToggle.addEventListener('change', updateLabels);
});
