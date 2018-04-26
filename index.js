var zlib = require('zlib');
var https = require('https');
var totalRequests, completedRequests, message_json;

const slackPostPath     = process.env.slackPostPath;
const slackBotUsername  = process.env.slackBotUsername;
const slackBotIconEmoji = process.env.slackBotIconEmoji;
const slackChannel      = process.env.slackChannel;


function processLogEvent(logEvent, context) {
    var date = new Date(logEvent.timestamp);

    message_json = JSON.parse(logEvent.message);

    var eventTime       = message_json.eventTime;
    var eventSource     = message_json.eventSource;
    var eventName       = message_json.eventName;
    var awsRegion       = message_json.awsRegion;
    var userAgent       = message_json.userAgent;
    var sourceIPAddress = message_json.sourceIPAddress;
    var eventType       = message_json.eventType;
    var arn             = message_json.userIdentity.arn;

    postToSlack(logEvent, eventType, sourceIPAddress, eventTime, eventSource, arn, eventName, awsRegion, userAgent, context);

}

function postToSlack(logEvent, eventType, sourceIPAddress, eventTime, eventSource, arn, eventName, awsRegion, userAgent, context) {
    var payloadStr = JSON.stringify({
        'channel' : slackChannel,
        'username': slackBotUsername,
        'attachments': [
            {
                'fallback': message_json,
                'text': '[' + eventName + ' from ' + sourceIPAddress + ']',
                'fields': [
                    {
                        'title': 'EventTime',
                        'value': eventTime,
                        'short': 'true'
                    },
                    {
                        'title': 'AWSRegion',
                        'value': awsRegion,
                        'short': 'true'
                    },
                    {
                        'title': 'EventSource',
                        'value': eventSource,
                        'short': 'true'
                    },
                    {
                        'title': 'UserAgent',
                        'value': userAgent,
                        'short': 'true'
                    },
                    {
                        'title': 'UserIdentity',
                        'value': arn,
                        'short': 'true'
                    },
                    {
                        'title': 'EventType',
                        'value': eventType,
                        'short': 'true'
                    }
                ],
                'color': '#02baf2',
                'footer': 'CloudTrail Logs',
                'footer_icon': "https://platform.slack-edge.com/img/default_application_icon.png"
            }
        ],
        'icon_emoji': slackBotIconEmoji,
    });

    var options = {
        hostname: 'hooks.slack.com',
        port: 443,
        path: slackPostPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadStr),
        }
    };

    var postReq = https.request(options, function(res) {
        var chunks = [];
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
            return chunks.push(chunk);
        });
        res.on('end', function() {
            var body = chunks.join('');

            if (res.statusCode < 400) {
                console.info('Message posted successfully');
            } else if (res.statusCode < 500) {
                console.error("Error posting message to Slack API: " + res.statusCode + " - " + res.statusMessage);
            } else {
                console.error("Server error when processing message: " + res.statusCode + " - " + res.statusMessage);
            }

            if (completedRequests++ == totalRequests - 1) {
                context.succeed('DONE');
            }
        });
        return res;
    });

    postReq.write(payloadStr);
    postReq.end();
}

exports.handler = function(event, context) {
    var payload = new Buffer(event.awslogs.data, 'base64');
    zlib.gunzip(payload, function(e, result) {
        if (e) {
            context.fail(e);
        } else {
            result = JSON.parse(result.toString('utf8'));
            console.log("Decoded payload: ", JSON.stringify(result));

            completedRequests = 0;
            totalRequests = result.logEvents.length;

            result.logEvents.forEach(function (logEvent) {
                processLogEvent(logEvent, context);
            });
        }
    });
};
