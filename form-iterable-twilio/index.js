const https = require('https');
const querystring = require('querystring');
const keys = {
    rechargeapps: {
        staging: {
            host: 'api.rechargeapps.com',
            token: 'enter token'
        },
        prod: {
            host: 'api.rechargeapps.com',
            token: 'todo'
        }
    },
    bitly: {
        host: 'api-ssl.bitly.com',
        token: 'enter token'
    },
    twilio: {
        from: 'id',
        host: 'api.twilio.com',
        token: 'enter token'
    },
    iterable: {
        host: 'api.iterable.com',
        token: 'enter token'
        campaignId: {
            email: 123,
            phone: 123
        }
    }
}
const bitly = (context, event, link) => {
    // Build the post string from an object
    const data = JSON.stringify({
        // "group_guid": keys.bitly.token.group_guid,
        "domain": "go.COMPANYNAME.com",
        "long_url": link
    });

    // An object of options to indicate where to post to
    const options = {
        host: keys.bitly.host,
        path: '/v4/shorten',
        method: 'POST',
        port: 443,
        headers: {
            'Authorization': `Bearer ${keys.bitly.token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const onEnd = (res) => {
        let short_link = res && res.link;
        let msg = (res && res.message);
        let description = (res && res.description);
        if (short_link) {
            phone(context, event, short_link);
        } else {
            context.fail(`Error: ${msg} ${description}`);
        }
    }

    wrapper(context, {data, options, onEnd})
}

const phone = (context, event, short_link) => {
    const buf = Buffer.from(keys.twilio.token, 'utf8');
    const first_name = event.shipping_address && event.shipping_address.first_name || '';
    let phoneNumber = event.phone.replace(/\D/g, '');
    if (phoneNumber.length === 10) {
        phoneNumber = '1' + phoneNumber;
    }

    if (phoneNumber.length !== 11) {
        context.fail(`Wrong phone number: ${phoneNumber}`);
    }

    // Build the post string from an object
    var data = querystring.stringify({
        "Body": `Hi, ${first_name}! Your COMPANYNAME order is ready to go with the recommended products from your provider. Click the link below to access your cart and easily complete your purchase. ${short_link}`,
        "From": keys.twilio.from,
        "To": phoneNumber
    });

    // An object of options to indicate where to post to
    const options = {
        host: keys.twilio.host,
        path: '/2010-04-01/Accounts/AC12f38021c775529bfd9f9563b64433f3/Messages.json',
        method: 'POST',
        port: 443,
        headers: {
            'Authorization': `Basic ${buf.toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    };

    const onEnd = (res) => {
        let sid = res && res.sid;
        let msg = (res && res.message) || 'Unknown error.';
        if (sid) {
            context.succeed({success: true, link: short_link + ' to ' + phoneNumber});
        } else {
            context.fail(`${msg}`);
        }
    }

    wrapper(context, {data, options, onEnd})
}


const email = (context, event, link) => {

    const first_name = event.shipping_address && event.shipping_address.first_name || '';
    const doctor_type = event.doctor_type ?  event.doctor_type : 'doctor';


    // Build the post string from an object
    const data = JSON.stringify({
        "recipientEmail": event.email,
        "campaignId": keys.iterable.campaignId.email,
        "dataFields": {first_name, link},
        "allowRepeatMarketingSends": false,
        "metadata": {}
    });

    // An object of options to indicate where to post to
    const options = {
        host: keys.iterable.host,
        path: '/api/email/target',
        method: 'POST',
        port: 443,
        headers: {
            'Api_Key': keys.iterable.token,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const onEnd = (res) => {
        let code = res && res.code;
        let msg = (res && res.msg) || 'Unknown error.';
        if (code === 'Success') {
            context.succeed({success: true, link: link});
        } else {
            context.fail(`${code} ${msg}`);
        }
    }

    wrapper(context, {data, options, onEnd})
}

const createCheckout = (context, event) => {
    // Build the post string from an object
    const data = JSON.stringify(event);
    const env = event.env || "test";

    // An object of options to indicate where to post to
    const options = {
        host: keys.rechargeapps[env].host,
        path: '/checkouts',
        method: 'POST',
        port: 443,
        headers: {
            'X-Recharge-Access-Token': keys.rechargeapps[env].token,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const onEnd = (res) => {
        let token = res && res.checkout && res.checkout.token;
        let errors = res && res.errors || 'Error.';
        if (token) {
            let link = `https://checkout.rechargeapps.com/r/checkout/${token}?${event.queryparams}`

            if (event.type === 'order') {
                context.succeed({success: true, link: link});
            } else if (event.type === 'email') {
                email(context, event, link);
            } else if (event.type === 'phone') {
                bitly(context, event, link);
            } else {
                context.fail('wrong_event_type');
            }
        } else {
            context.fail(JSON.stringify(errors));
        }
    }

    wrapper(context, {data, options, onEnd})

}

const wrapper = (context, params) => {
    const request = https.request(params.options, function (res) {
        let body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            params.onEnd(JSON.parse(body));
        });

        res.on('error', function (e) {
            context.fail(e.message);
        });
    });

    // post the data
    request.write(params.data);
    request.end();


}

exports.handler = function (event, context) {
    createCheckout(context, event);
};