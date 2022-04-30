const https = require('https');

const keys = {
    secondsBack: 60,
    powerreviews: {
        token: 'enter token'
        host: 'enterprise-api.powerreviews.com',
    },
    magento: {
        token: 'enter token'
        host: 'mcstaging.COMPANYNAME.com'
    },
    segment: {
        token: 'enter token'
        host: 'api.segment.io'
    }
}

let reviewsCount = 0;
let trackedCount = 0;
let count = {reviews: 0, eventsOk: 0, eventsFail: 0};
let userCache = {};


const powerReviewsFetch = (context, event, access_token) => {
    // Build the post string from an object
    const data = '';
    let created_date = +new Date() - keys.secondsBack * 1000 ;
    // An object of options to indicate where to post to
    const options = {
        host: keys.powerreviews.host,
        //  select last hour
        path: `/v1/reviews?created_date=${created_date}`,
        method: 'GET',
        port: 443,
        headers: {
            'Authorization': `${access_token}`,
            'Accept': 'application/json'
        }
    };

    //context.succeed({success: true, options: options});
    const onEnd = (res) => {
        let reviews = (res && res.reviews) || [];
        count.reviews = trackedCount = reviewsCount = reviews.length;
        if (reviewsCount > 0) {
            reviews.forEach((review) => {
                getMagentoUser(context, review);
            })
            let interval = setInterval(() => {
                if (reviewsCount === 0) {
                    trackSegments(context, reviews);
                    clearInterval(interval);
                }
            }, 50);
        } else {
            context.succeed({success: true, count: count});
        }
    }

    wrapper(context, {data, options, onEnd})
}

const powerReviewsAuth = (context, event) => {
    // Build the post string from an object
    const data = '';
    const buf = Buffer.from(keys.powerreviews.token, 'utf8');
    // An object of options to indicate where to post to
    const options = {
        host: keys.powerreviews.host,
        path: '/oauth2/token?grant_type=client_credentials',
        method: 'POST',
        port: 443,
        headers: {
            'Authorization': `Basic ${buf.toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };


    const onEnd = (res) => {
        let access_token = res && res.access_token;
        let error = (res && res.error) || 'Error';

        if (access_token) {
            powerReviewsFetch(context, event, access_token);
        } else {
            context.fail(`Error: ${error}`);
        }
    }

    wrapper(context, {data, options, onEnd})
}


const createEvent = (review) => {

    // Build the post string from an object
    const client_specific_questions = review.client_specific_questions || {};
    const howlonghaveyoubeenusingCOMPANYNAME = client_specific_questions.howlonghaveyoubeenusingCOMPANYNAME
        && client_specific_questions.howlonghaveyoubeenusingCOMPANYNAME.value
        && client_specific_questions.howlonghaveyoubeenusingCOMPANYNAME.value.selected
        && client_specific_questions.howlonghaveyoubeenusingCOMPANYNAME.value.selected[0];
    const didtheorderingandshippingprocessmeetyourexpectatio = client_specific_questions.didtheorderingandshippingprocessmeetyourexpectatio
        && client_specific_questions.didtheorderingandshippingprocessmeetyourexpectatio.value;
    const whichqualitiesofyourhairhaveimprovedsinceusingnutr = client_specific_questions.whichqualitiesofyourhairhaveimprovedsinceusingnutr
        && client_specific_questions.whichqualitiesofyourhairhaveimprovedsinceusingnutr.value
        && client_specific_questions.whichqualitiesofyourhairhaveimprovedsinceusingnutr.value.selected;
    const booster = client_specific_questions.booster
        && client_specific_questions.booster.value
        && client_specific_questions.booster.value.selected;
    const magentoUser = review.magentoUser;
    const data = {
        "event": "Review Submitted",
        "properties": {
            "email": review.email,
            "bottom_line": review.bottom_line,
            "firstname": magentoUser.firstname,
            "location": review.location,
            "core_category": review.product_page_id,
            "rating": review.rating,
            "headline": review.headline,
            "comments": review.comments,
            "booster": booster,
            "howlonghaveyoubeenusingCOMPANYNAME": howlonghaveyoubeenusingCOMPANYNAME,
            "didtheorderingandshippingprocessmeetyourexpectatio":didtheorderingandshippingprocessmeetyourexpectatio,
            "whichqualitiesofyourhairhaveimprovedsinceusingnutr": whichqualitiesofyourhairhaveimprovedsinceusingnutr
        },
        "userId": magentoUser.id
    };
    return data;
}

const trackSegments = (context, reviews) => {

    const buf = Buffer.from(keys.segment.token, 'utf8');

    // An object of options to indicate where to post to
    const options = {
        host: keys.segment.host,
        path: '/v1/track',
        method: 'POST',
        port: 443,
        headers: {
            'Authorization': `Basic ${buf.toString('base64')}`,
            'Accept': 'application/json'
        }
    };

    reviews.forEach((review) => {
        const data = JSON.stringify(createEvent(review));
        const onEnd = (res) => {
            let success = (res && res.success);
            trackedCount--;
            if (success){
                count.eventsOk++;
            } else {
                count.eventsFail++;
            }
            let interval = setInterval(() => {
                if (trackedCount === 0) {
                    clearInterval(interval);
                    context.succeed({success: true, count: count});
                }
            }, 50);
        }

        wrapper(context, {data, options, onEnd})
    })



}

const getMagentoUser = (context, review) => {
    //check cache
    //console.log('getMagentoUser  ', review.email);
    if (userCache[review.email]) {
        review.magentoUser = userCache[review.email];
        reviewsCount--;
        //console.log('cache used for  ', review.email);
        return;
    }
    // Build the post string from an object
    const data = '';
    // An object of options to indicate where to post to
    const options = {
        host: keys.magento.host,
        path: `/rest/all/V1/customers/search?searchCriteria[filterGroups][0][filters][0][field]=email&searchCriteria[filterGroups][0][filters][0][value]=${review.email}`,
        method: 'GET',
        port: 443,
        headers: {
            'Authorization': `Bearer ${keys.magento.token}`,
            'Accept': 'application/json'
        }
    };


    const onEnd = (res) => {
        let user = (res && res.items && res.items[0]) || {id: "null", firstname: "null" };
        let message = (res && res.message) || 'User not found';
        reviewsCount--;
        //  console.log('-------------------');
        //  console.log('ts ', new Date());
        //  console.log('reviewsCount ', reviewsCount);
        //  console.log('review.email ', JSON.stringify(review));
        //  console.log('typeof userCache[review.email] ', typeof userCache[review.email]);
        //  console.log('magento user', JSON.stringify(user));
        review.magentoUser = user;
        userCache[review.email] = user;
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
    powerReviewsAuth(context, event);
};

//powerReviewsAuth();