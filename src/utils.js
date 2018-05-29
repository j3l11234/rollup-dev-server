const os = require('os');
const chalk = require('chalk');
 
color.black = '\x1B[39m';

// 无操作
module.exports.noop = function () { };

// 获取服务器内网URL，方便移动端测试
module.exports.getServerUrl = function getServerUrl(protocol, port) {
    if (!protocol) {
        protocol = 'http';
    }
    if ('number' !== typeof port || isNaN(port)) {
        port = 3000;
    }

    const ifaces = os.networkInterfaces();
    return Object.keys(ifaces).map(function (iface) {
        return ifaces[iface];
    }).reduce(function (data, addresses) {
        addresses.filter(function (addr) {
            return addr.family === "IPv4";
        }).forEach(function (addr) {
            data.push(addr);
        });
        return data;
    }, []).map(function (addr) {
        return protocol + "://" + addr.address + ":" + port;
    });
}

// 格式化一个错误对象
function formatError(err) {

    // 错误分析
    if (!(err instanceof Error)) {
        return err;
    }
    const stack = err.stack.split(/\n/);

    stack[0] = err.message + ' (' + chalk.yellow(err.name) + ')';
    return stack.map(v => v).join('\n          ');
}

// 控制台输出
module.exports.logger = function logger(title) {
    return {
        erro(...args) {
            const argv = args.map(arg => formatError(arg));
            console.log(chalk.red(`[${title} Erro]`), ...argv);
        },
        warn(...args) {
            console.log(chalk.yellow(`[${title} Warn]`), ...args);
        },

        info(...args) {
            console.log(chalk.green(`[${title} Info]`), ...args);
        }
    };
}

// 内容文件管理
module.exports.memory = {
    _data: {},
    has(key) {
        return Reflect.has(this._data, key);
    },
    get(key) {
        return this._data[key];
    },
    set(key, val) {
        this._data[key] = val;
    },
    reset() {
        this._data = {}
    },
    lookup(callback) {
        var keys = Object.keys(this._data);

        for (let key of keys) {
            if (callback(key, this.get(key))) {
                break;
            }
        }
    }
};