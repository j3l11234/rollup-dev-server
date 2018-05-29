var WebSocket = window.MozWebSocket || window.WebSocket;

var style = {
    erro: 'color: red; font-size: 12px;',
    info: 'color: green; font-size: 12px;',
};

// 刷新CSS样式
function refreshCSS() {
    var sheets = [].slice.call(document.getElementsByTagName("link"));
    var head = document.getElementsByTagName("head")[0];
    for (var i = 0; i < sheets.length; ++i) {
        var elem = sheets[i];
        head.removeChild(elem);
        var rel = elem.rel;
        if (elem.href && typeof rel != "string" || rel.length == 0 || rel.toLowerCase() == "stylesheet") {
            var url = elem.href.replace(/(&|\?)_cacheOverride=\d+/, '');
            elem.href = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_cacheOverride=' + (new Date().valueOf());
        }
        head.appendChild(elem);
    }
}

if (WebSocket) {
    var ws = new WebSocket(sockUrl);

    ws.onopen = function () {
        // ws.send('data')
        console.log('%c%s', style.info, 'Socket Monitor Opened');
    };

    ws.onmessage = function (event) {
        var data = JSON.parse(event.data);
        console.log('%c%s', style.info, '[ACTION]', data.action);
        switch (data.action) {
            case 'style':
                // refreshCSS();
                // ws.send(JSON.stringify({
                //     action: 'refreshCSS',
                //     status: 200
                // }));
                // break;
            case 'script':
            case 'reload':
                ws.send(JSON.stringify({
                    action: 'close',
                    status: 200
                }));
                location.reload();
                break;
        }
    };

    ws.onclose = function (event) {
        console.log('%c%s', style.info, 'Socket closed !');
    };

    // 页面卸载前关闭sockit
    window.unload = function () {
        ws.close();
    };
} else {
    console.log('%c%s', style.erro, 'WebSocket not supported');
} 