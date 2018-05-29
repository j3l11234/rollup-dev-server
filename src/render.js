
const fs = require('fs');
const path = require('path');
const injectStyles = fs.readFileSync(path.join(__dirname, './render.css'), 'utf8');
const injectScript = fs.readFileSync(path.join(__dirname, './client.js'), 'utf8');

/**
 * 获取一个完整的HTML页面
 * @function getDocumentMark
 * @param {object} dataset 传递给页面的数据
 * @returns {string} html文件
 */
function getDocumentMark(dataset) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset='utf-8'> 
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>${getValidValues(dataset.title)}</title>
    <!-- Page Head --> 
    <style type="text/css">
      ${injectStyles}
    </style>
  </head>
  <body>
    <!-- Page Body -->
    <div class="container clearfix">
      ${getValidValues(dataset.body)}
    </div>
    <!-- Page Foot -->
  </body>
</html>`;
}

/**
 * 获取目录列表
 * @function getDirectory
 * @param {object} dataset
 * @param {object} dataset.fallback 
 * @returns {string} html片段
 */
function getDirectory(dataset) {

  let title;
  const map = dataset.fallback; 
  
  if (Array.isArray(map)) {
    title = `<h1><a href="/">~</a> ${map.map((v, i) => v !== '' ? '<a href="' + map.slice(0, i+1).join('/') + '">' + v + '/</a>' : '').join('')}</h1>`;
  }

  let list;
  const directory = dataset.directory;

  if (Array.isArray(directory)) {
    let max = directory.length, temp;
    if (max > 0) {
      list = '<ul class="list">';
      for (let i = 0; i < max; i++) {
        temp = directory[i];

        list += `
        <li class="item">
          <a${temp.icon ? ' class="icon icon-"' + temp.icon : ''} href="${temp.url}">${temp.text}</a>
          <div class="tips">
            <p class="size">size: <b>${temp.size}</b></p>
            <p class="time">time: ${temp.time}</p>
          </div>
        </li>`; // 获取列表的HTML内容
      }
      list += '</ul>';
    }
  }

  return `${title ? title : ''}${list ? list : ''}`;
}

/**
 * 获取有效值
 * @param {*} value 
 */
function getValidValues(value) {
  return value === null || 'undefined' === typeof value ? '' : value;
}

module.exports.getDocumentMark = getDocumentMark;
module.exports.getDirectory = getDirectory;
module.exports.injectScript = injectScript;

