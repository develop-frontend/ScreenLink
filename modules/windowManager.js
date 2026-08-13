export default class WindowManager {

    async getSources() {

        return await window.api.getSources();

    }

    async getSourceById(id) {

        const sources = await this.getSources();

        return sources.find(source => source.id === id);

    }

}