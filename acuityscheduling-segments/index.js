const https = require('https');
const querystring = require('querystring');

const keys = {
    staging: {
        acuityscheduling: {
            host: 'acuityscheduling.com',
            token: 'enter token'
        },
        segment: {
            host: 'api.segment.io',
            token: 'enter token'
        }
    },
    production: {
        acuityscheduling: {
            host: 'acuityscheduling.com',
            token: 'enter token'
        },
        segment: {
            host: 'api.segment.io',
            token: 'enter token'
        }
    }
}



const getAppointment = (context, event) => {

    const body = querystring.parse(event.body);
    const data = '';
    const keysEnv = keys[event.context.stage];

    const buf = Buffer.from(keysEnv.acuityscheduling.token, 'utf8');
    const options = {
        host: keysEnv.acuityscheduling.host,
        path: `/api/v1/appointments/${body.id}`,
        method: 'GET',
        headers: {
            'Authorization': `Basic ${buf.toString('base64')}`,
            'Accept': 'application/json'
        }
    };


    const onEnd = (res) => {
        let success = (res && res.id);
        if (success) {
            //context.succeed({success: true, appointment: res});
            trackSegment(context, res, event)
        } else {
            context.fail(JSON.stringify(res));
        }
    }

    wrapper(context, {
        data,
        options,
        onEnd
    })
}

const createEvent = (appointment, body) => {

    // Build the post data from an object
    const data = {
        "event": `appointment ${body.action}`,
        "anonymousId": appointment.id,
        "properties": {
            "email": appointment.email,
            "appointmentDateTime": appointment.datetime,
            "appointmentTypeId": body.appointmentTypeID,
            "appointmentBody": appointment
        }
    };
    return data;
}

const trackSegment = (context, appointment, event) => {
    const keysEnv = keys[event.context.stage];
    const body = querystring.parse(event.body);
    const buf = Buffer.from(keysEnv.segment.token, 'utf8');
    // An object of options to indicate where to post to
    const options = {
        host: keysEnv.segment.host,
        path: '/v1/track',
        method: 'POST',
        port: 443,
        headers: {
            'Authorization': `Basic ${buf.toString('base64')}`,
            'Accept': 'application/json'
        }
    };
    //context.succeed({event: event, keysEnv: keysEnv});
    const data = JSON.stringify(createEvent(appointment, body));
    //context.succeed({ options, data: createEvent(appointment, body)});
    const onEnd = (res) => {
        let success = (res && res.success);
        if (success) {
            context.succeed({ success: true});
        } else {
            context.fail('createEvent fail');
        }
    }

    wrapper(context, {
        data,
        options,
        onEnd
    })
}


const wrapper = (context, params) => {
    const request = https.request(params.options, function (res) {
        let body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            //context.succeed({success: true, res:body });
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
    const body = querystring.parse(event.body);
    //context.succeed({event});
    if (body && body.id && body.action) {
        getAppointment(context, event);
    } else {
        context.fail(`wrong event ${JSON.stringify(event.body)}`);
    }
};