// NODE_ENV: development
// ---------------------
// 非开发环境时抛出一个错误，中断进程
if (String(process.env.NODE_ENV || 'development').trim() !== 'development') {
    console.error('当前rollup配置只能在开发环境中使用，请检查环境变量的值是否为: development');
    process.exit(0); // 程序非正常退出
}

// System Tools 
const fs = require('fs');
const util = require('util');
const path = require('path');
const assert = require('assert');

// Dev Server 
const http = require('http');
const Stream = require('stream');
const mime = require('mime');
const opn = require('opn');
const WebSocket = require('faye-websocket');
const chokidar = require('chokidar');

// Rollup
const program = require('rollup');

// Custom Utils
const { getDocumentMark, getDirectory, injectScript } = require('./src/utils');
const utils = require('./src/utils');

const logger = utils.logger('Hotdev');
const getServerUrl = utils.getServerUrl;
const memory = utils.memory;

// System Utils 
const fsReadFile = util.promisify(fs.readFile);
const fsStat = util.promisify(fs.stat);
const fsExists = util.promisify(fs.exists);
const fsReaddir = util.promisify(fs.readdir);

// system var
const noop = function () { };

/**
 * rollup 编译
 * @function compile
 * @param {object} opt 要编译配置
 * @return {array|boolean} 编译是否成功，true 表示成功
 * @private
 */
async function compile(opt) {
    return await program.rollup(opt).then(bundle => {
        return bundle.generate(opt.output).then(result => {

            logger.info('Complied ' + opt.input);

            // 生成资源，但不写入磁盘，而是写入内存
            const name = opt.output.name;
            const hash = result.modules.join('|');
            memory.set(name, {
                hash: hash,
                code: result.code
            });

            // 返回 true 表示编译成功
            return true;
        }).catch(err => void logger.erro(err));

    }).catch(err => void logger.erro(err));;
}

/**
 * 监听文件变化,执行编译
 * @function watch
 * @param {object} opt 
 * @returns {object} 返回监听器的引用
 * @private
 * @desc rollup 首次编译结束后，开启热开发服务器 
 */
function watch(opt) {

    // opt variable 
    const include = opt.include || process.cwd();
    const options = opt.options || {};
    const onready = 'function' === typeof opt.onready ? opt.onready : noop; // 监听器就绪时的回调
    const onwatch = 'function' === typeof opt.onwatch ? opt.onwatch : noop; // 监听到变化时执行的回调

    // sys variable
    const watcher = chokidar.watch(include, options);

    watcher.on('ready', function () {
        logger.info('Monitor is ready ...');
        onready();

        watcher.on('all', function (evt, paths) {
            logger.info(evt + ' ' + paths);
            onwatch(evt, paths);
        });
    });

    return watcher;
}

/** 
 * web服务器 listen 的回调
 * @private 
 **/
function listen() {
    const serverUrl = getServerUrl('http', this.port)[1];
    logger.info('Server is running, Address ' + serverUrl);
    opn(serverUrl);
}


/**
 * web服务器 `upgrade` 事件的监听器，用于升级连接协议：Protocol upgrade to `websocket`
 * @desc 参数同 httpServer.on('upgrage', listener) 的 listener
 * @private
 */
function upgrade(request, socket, head) {
    if (WebSocket.isWebSocket(request)) {
        const ws = new WebSocket(request, socket, head);

        ws.on('message', (evt) => {
            const data = JSON.parse(evt.data);
            if (data.status !== 200) {
                // logger.info(data.action + ' operation success !');
                logger.erro(data.action + ' operation failed !');
            }

            if (data.action === 'close') {
                ws.close();
            }
        });


        ws.on('close', () => {
            this.sockets = this.sockets.filter((x) => x !== ws);
        });

        this.sockets.push(ws);
    }
}

/**
   * TCP Handler
   * @param {object} req 
   * @param {object} res 
   * @private
   */
async function listener(req, res) {

    var url = decodeURI(req.url).split('?')[0]; // http URL中的路径
    var paths = path.join(this.root, url); // 磁盘上对应资源的全路径
    var name = path.parse(paths).name;

    // 服务器返回值
    var body;

    // 服务器默认的 Content-type
    var type = mime.getType(url) || 'text/plain';

    // 是否为HTML等试图文件
    var view = type.includes('/html');

    if (memory.has(name) && !view) {

        // 读取文件: 从内存中读取
        body = memory.get(name).code;
    }

    if (!body) {
        if (await fsExists(paths)) {

            const stat = await fsStat(paths);

            if (stat.isDirectory()) {

                // 读取文件夹: Content-Type: text/html  
                type = 'text/html';
                body = await readdir.call(this, paths, url);
            } else if (stat.isFile()) {

                // 读取文件: 从磁盘读取 
                body = view ? await fsReadFile(paths, 'utf8') : fs.createReadStream(paths, 'utf-8');
            } else {

                res.statusCode = 403;
                res.end('403 Blocking access', 'utf-8');
                return;
            }
        } else {

            res.statusCode = 404;
            res.end('Not Found', 'utf-8');
            return;
        }
    }


    assert.ok(type, '`Content-Type` is not correct');

    if (type.indexOf('/html') > -1) {

        const temp = body.split('</body>');
        body = temp[0] + this.injectScript + '</body>' + temp[1];
    }

    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', type);
    res.statusCode = 200;

    if ('string' == typeof body) {
        return res.end(body, 'utf-8');
    }

    if (body instanceof Stream) {
        return body.pipe(res);
    }
}

/**
 * 读取文件夹，并渲染成一个HTML
 * @param {string} paths 文件夹的完整路径
 * @param {string} url 文件夹在http url中的映射路径
 * @private 
 */
async function readdir(paths, url) {
    const dirset = await fsReaddir(paths);

    const directory = [];

    for (let name of dirset) {
        // 过滤掉隐藏文件
        if (name.charAt(0) === '.') {
            continue;
        }

        const temp = path.join(paths, name);
        const ext = path.parse(temp).ext.split('.')[1] || 'dir';
        const stat = await fsStat(temp);

        directory.push({
            url: path.join(url, name),
            icon: ext,
            text: name,
            size: stat.size >= 1024 ? (stat.size / 1024).toFixed(2) + 'MB' : stat.size + 'B',
            time: new Date(stat.ctime).toLocaleDateString()
        });
    }


    const dirdata = {
        fallback: url.split(path.sep),
        directory
    };

    return getDocumentMark({
        title: url,
        body: getDirectory(dirdata)
    });
}


/** 
 * 热开发服务器
 * @constructor 
 * 
 * @method publish(message) 推送一则消息到所有的 websocket 客户端 
 **/
class Server {
    constructor(opts = {}) {

        //  配置项
        this.root = opts.root || process.cwd();
        this.port = opts.port || 9004;

        this.sockets = [];
        const injected = `<script type="text/javascript">!function (){\nvar sockUrl= '${getServerUrl('ws', this.port)[1]}';\n${injectScript}\n}();</script>`
        this.injectScript = injected;

        this.server = http.createServer(listener.bind(this));
        this.server.listen(this.port, listen.bind(this));
        this.server.on('upgrade', upgrade.bind(this));

        // 终端退出时，正常关闭服务器，并且结束进程
        ['SIGINT', 'SIGTERM'].forEach((signal) => {
            process.on(signal, () => {
                this.server.close();
                process.exit();
            });
        });
    }

    /**
     * 推送消息到 所有的 websocket 连接端
     * @param {*} message 
     * @public
     */
    publish(message) {
        this.sockets.forEach(ws => ws.send(JSON.stringify(message || '')));
    }

    /**
     * 关闭服务器
     * 同时会关闭每个webscoket连接
     * @public
     **/
    close() {
        this.sockets.forEach(ws => ws.close());
        this.server.close();
    }
}

/**
 * 检查、并将用户的 Rollup 配置转为可用的对象
 * @function checkRollupOptions
 * @param {object|array} opts 
 * @returns {object|null}
 */
function checkRollupOptions(opts) {

    if (!Array.isArray(opts)) {
        // 将配置强行装为数组，并提取其中的对象作为可用的配置，其余视为非法配置
        opts = [].concat(opts).filter(v => v !== null && 'object' === typeof v);
    }

    if (opts.length === 0) {
        return null;
    }

    let temp = {};
    for (const opt of opts) {
        // 检查配置的正确性
        // 入口、出口不正确时，视为配置错误
        const { input, output } = opt;
        const dest = output && output.file; 

        if ('string' !== typeof input || /^\s+$/g.test(input) || !dest || 'string' !== typeof dest || /^\s+$/g.test(dest)) {

            logger.erro(new Error('rollop 配置错误, 请看 http://www.rollupjs.com/big-list-of-options/'));
            return process.exit();
        }
        const name = path.parse(input).name;
        opt.output.name = name;
        temp[name] = opt;
    }

    return temp;
}

/**
 * 启动热开发服务器
 * @function devServer
 * @param {object} opts 
 * 
 * 用例：
 *      devServer({
 *          server: {
 *              root: './dist',
 *              port: 3000
 *          },
 *          watch: {
 *              include: ['./'],
                options: {}
 *          },
 *          rollup: {
 *               input: './app.js',
 *               output: {
 *                   file: './dist/app.js', 
 *                   format: 'cjs'
 *               } 
 *           } 
 *      });
 *  
 * @returns {object} {watcher, server} 监听器和服务器的引用 
 */
module.exports = function devServer(opts) {
    const _opts = {
        // 服务器配置
        server: {
            root: null, // 站点根路径
            port: null, // 站点端口
        },
        // 监听器配置，同 chokidar.watch 的配置
        watch: {
            include: ['./'], // 监听器监听的文件目录 与 服务器根目录无关
            options: {}
        },
        // 传递给 rollup 打包程序的配置
        rollup: {}
    };

    opts.rollup = checkRollupOptions(opts.rollup); // 保证此处接收一个对象

    if (!opts.rollup) {
        logger.erro('你并没有提供任何有效的 rollup 配置, 请看 http://www.rollupjs.com/big-list-of-options/');
        process.exit();
        return;
    }

    const optRollup = Object.assign({}, _opts.rollup, opts.rollup); // rollup 配置
    const optServer = Object.assign({}, _opts.server, opts.server); // 服务器配置

    let server;
    const watcher = watch(Object.assign({}, _opts.watch, opts.watch, {
        onready() {
            for (let name in optRollup) {
                compile(optRollup[name]);
            }

            server = new Server(optServer);
        },
        onwatch(evt, paths) {
            const { ext, name } = path.parse(paths);
            const data = { action: 'reload', url: paths.replace(server.root, '') };

            memory.lookup(function (key, bundle) {
                if (bundle.hash.includes(paths)) {
                    compile(optRollup[key]);
                }
            });

            if (/\.(s)?css/i.test(ext)) {
                data.action = 'style'
            } else if (/\.js/i.test(ext)) {
                data.action = 'script';
            }

            server.publish(data);
        }
    }));

    return {
        watcher,
        server
    }
}
