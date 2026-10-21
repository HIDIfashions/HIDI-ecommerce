export async function rasterizePriceTagDocument(doc) {
  const cache = new Map();
  for (const tag of doc.querySelectorAll('.price-tag')) {
    const rect = tag.getBoundingClientRect();
    const dots = 8 * 25.4 / 96;
    const width = Math.round(rect.width * dots), height = Math.round(rect.height * dots);
    const legal = tag.querySelector('.legal'), address = tag.querySelector('.postal-address');
    const metrics = { width:rect.width, height:rect.height, legalScroll:legal.scrollHeight,legalClient:legal.clientHeight,
      addressLines:address.children.length,addressFits:address.scrollWidth<=address.clientWidth,
      logoPaths:tag.querySelectorAll('.brand svg path').length,logoHeight:tag.querySelector('.brand svg').getBoundingClientRect().height,
      bottomGap:rect.bottom-legal.lastElementChild.getBoundingClientRect().bottom,
      titleFont:parseFloat(doc.defaultView.getComputedStyle(tag.querySelector('.product-name')).fontSize),text:tag.textContent };
    const key = width+'x'+height+tag.innerHTML;
    let url = cache.get(key);
    if (!url) {
      const canvas = doc.createElement('canvas');canvas.width=width;canvas.height=height;
      const context = canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,width,height);context.fillStyle='#000';
      const point = r => ({x:(r.left-rect.left)*dots,y:(r.top-rect.top)*dots,w:r.width*dots,h:r.height*dots});
      for (const element of tag.querySelectorAll('*')) {
        const style=doc.defaultView.getComputedStyle(element), box=point(element.getBoundingClientRect());
        for (const side of ['Top','Bottom']) {const thickness=parseFloat(style['border'+side+'Width']);if(thickness>0)context.fillRect(Math.round(box.x),Math.round(side==='Top'?box.y:box.y+box.h-thickness*dots),Math.round(box.w),Math.max(1,Math.round(thickness*dots)));}
      }
      const logo=tag.querySelector('.brand svg'), logoBox=point(logo.getBoundingClientRect());
      const image=new doc.defaultView.Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Unable to flatten the HIDI logo.'));image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(logo));});
      const logoRatio=logo.viewBox.baseVal.width/logo.viewBox.baseVal.height;
      const logoWidth=Math.min(logoBox.w,logoBox.h*logoRatio),logoHeight=logoWidth/logoRatio;
      context.drawImage(image,Math.round(logoBox.x+(logoBox.w-logoWidth)/2),Math.round(logoBox.y+(logoBox.h-logoHeight)/2),Math.round(logoWidth),Math.round(logoHeight));
      const barcode=tag.querySelector('.barcode svg'), barcodeBox=point(barcode.getBoundingClientRect());
      const modules=barcode.viewBox.baseVal.width, unit=Math.max(1,Math.floor((width-2)/modules)), left=Math.floor((width-modules*unit)/2);
      for(const bar of barcode.querySelectorAll('rect')) context.fillRect(left+Number(bar.getAttribute('x'))*unit,Math.round(barcodeBox.y),Number(bar.getAttribute('width'))*unit,Math.round(barcodeBox.h));
      const walker=doc.createTreeWalker(tag,doc.defaultView.NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode, parent=node.parentElement;
        if(parent.closest('svg,style')||!node.textContent.trim())continue;
        const style=doc.defaultView.getComputedStyle(parent), scale=Number(tag.dataset.contentScale||1);
        const fontSize=Math.max(1,Math.round(parseFloat(style.fontSize)*dots*scale));
        context.font=style.fontWeight+' '+fontSize+'px Arial';context.textBaseline='alphabetic';
        let line='', box=null;
        const draw=()=>{if(!line.trim()||!box)return;const p=point(box), ascent=context.measureText('Hg').actualBoundingBoxAscent||fontSize*.8;context.fillText(line,Math.round(p.x),Math.round(p.y+(p.h-fontSize)/2+ascent),Math.max(1,Math.ceil(p.w)));};
        for(let i=0;i<node.textContent.length;i++) {
          const range=doc.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();
          if(!r.width||!r.height)continue;
          if(box&&Math.abs(r.top-box.top)>1){draw();line='';box=null;}
          line+=style.textTransform==='uppercase'?node.textContent[i].toUpperCase():style.textTransform==='lowercase'?node.textContent[i].toLowerCase():node.textContent[i];box=box?{left:box.left,top:box.top,width:r.right-box.left,height:Math.max(box.height,r.height)}:r;
        }
        draw();
      }
      const pixels=context.getImageData(0,0,width,height);
      for(let i=0;i<pixels.data.length;i+=4){const v=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<180?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;}
      context.putImageData(pixels,0,0);url=canvas.toDataURL('image/png');cache.set(key,url);
    }
    const output=new doc.defaultView.Image();output.alt=metrics.text;output.className='thermal-label-image';output.style.cssText='display:block;width:100%;height:100%;image-rendering:pixelated';
    await new Promise((resolve,reject)=>{output.onload=resolve;output.onerror=()=>reject(new Error('Unable to prepare the thermal label image.'));output.src=url;});
    tag.replaceChildren(output);tag.style.setProperty('padding','0','important');tag.style.display='block';tag.dataset.layoutMetrics=JSON.stringify(metrics);tag.dataset.rasterReady='203';tag.dataset.rasterWidth=String(width);tag.dataset.rasterHeight=String(height);
  }
}
