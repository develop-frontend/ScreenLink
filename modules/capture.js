export default class Capture {

    async start() {

        return await navigator.mediaDevices.getDisplayMedia({

            audio: false,

            video: {

                cursor: "never",

                frameRate: {
                    ideal: 60,
                    max: 60
                }

            }

        });

    }

}