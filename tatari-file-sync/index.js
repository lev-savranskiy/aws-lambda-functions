const AWS = require('aws-sdk');
const SES = new AWS.SES();
const fs = require("fs");
const sourceBucket = "tatari-reports-exports";
const sourcePrefix = "COMPANYNAME/";
const destinationBucket = "COMPANYNAME-tatari";
const destinationPrefix = "COMPANYNAME/";
const accessKeyId = 'token';
const secretAccessKey = 'token';
const sts = new AWS.STS({accessKeyId, secretAccessKey});

exports.handler = async (event, context) => {
    //getting Tatari DataShare access
    const timestamp = (new Date()).getTime();
    const sts_params = {
        RoleArn: 'arn:aws:iam::token:role/ClientRoles/DataShare/ClientRole-DataShare-COMPANYNAME',
        RoleSessionName: `id-${timestamp}`,
        DurationSeconds: 3600
    };
    const {Credentials} = await sts.assumeRole(sts_params).promise();
    console.log('Getting Credentials OK');
    console.log('---------------');
    const {AccessKeyId, SecretAccessKey, SessionToken} = Credentials;

    const paramsTatari = {
        accessKeyId: AccessKeyId,
        secretAccessKey: SecretAccessKey,
        sessionToken: SessionToken
    };

    //listing Tatari DataShare  folder
    const s3 = new AWS.S3(paramsTatari);
    const filesTatari = [];
    const paramsTatariList = {
        Bucket: sourceBucket,
        Prefix: sourcePrefix
    }

    for (;;) {
        let data = await s3.listObjects(paramsTatariList).promise();
        let Key = null;
        data.Contents.forEach((elem) => {
            Key = elem.Key;
            if(Key.indexOf('.') > -1){
                filesTatari.push(Key);
            }
        });

       if (!data.IsTruncated) {
            break;
        }
        paramsTatariList.Marker = Key;
    }
    //listing COMPANYNAME   folder
    const filesCOMPANYNAME = [];
    const paramsCOMPANYNAME = {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    };

    const s3COMPANYNAME = new AWS.S3(paramsCOMPANYNAME);
    const paramsCOMPANYNAMEList = {
        Bucket: destinationBucket
    }
    for (;;) {
        let data = await s3COMPANYNAME.listObjects(paramsCOMPANYNAMEList).promise();
        let Key = null;
        data.Contents.forEach((elem) => {
            Key = elem.Key;
            if(Key.indexOf('.') > -1){
                filesCOMPANYNAME.push(Key);
            }

        });
        if (!data.IsTruncated) {
            break;
        }
        paramsCOMPANYNAMEList.Marker = Key;
    }

    let difference = filesTatari.filter(x => !filesCOMPANYNAME.includes(x));

    console.log(`filesTatari ${filesTatari.length}`);
    console.log(`filesCOMPANYNAME ${filesCOMPANYNAME.length}`);
    console.log(`${difference.length} files to sync`);

    //return;
    // test
    //difference = difference.slice(0, 100)

    let i = 0;
    let total = difference.length;
    let status = {success: 0, fail: 0};
    await Promise.all(
        difference.map(async Key => {

            await s3.getObject({
                Bucket: sourceBucket,
                Key: Key
            }, (err, data) => {
                if (err) {
                    status.fail++;
                    console.error(err);
                } else {
                    let newKey =  Key;
                    console.log(`making file ${newKey}`);
                    const params = {
                        Bucket: destinationBucket,
                        Key: newKey,
                        Body: Buffer.from(data.Body, 'base64')
                    };

                    // Uploading files to the COMPANYNAME bucket
                    s3COMPANYNAME.upload(params, function (err, data) {
                        if (err) {
                            status.fail++;
                            console.log("writeFile failed: " + err);
                        } else {
                            status.success++;
                            console.log("writeFile succeeded: " + newKey);
                        }
                        console.log(`success: ${status.success}; fail: ${status.fail}`);
                    });
                }
            });
        })
    );



    function wait() {
        return new Promise((resolve, reject) => {
            setTimeout(() => resolve("waiting..."), 1000)
        });
    }

    while (status.fail + status.success < total) {
        await wait();
    }

    if(total > 0){
        const emailParams = {
            Destination: {
                ToAddresses: ['lev@COMPANYNAME.com'],
            },
            Message: {
                Body: {
                    Html: { Data: `success: ${status.success}; fail: ${status.fail} <pre>${difference.join('<br/>')}</pre>` }
                },
                Subject: {
                    Data: `Tatari sync ${total} files ` + new Date()
                },
            },
            Source: 'support@COMPANYNAME.com'
        };

        await SES.sendEmail(emailParams).promise();

    }


    context.succeed({success: true, status: status});
}