'use strict';
class NativeUpdates {
  constructor(updater,{progress=()=>{},error=()=>{}}={}) {
    this.updater=updater;this.ready=false;
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;
    updater.autoRunAppAfterInstall=true;updater.disableWebInstaller=true;
    updater.disableDifferentialDownload=true;
    updater.on('download-progress',value=>progress(Math.floor(value.percent)));
    updater.on('error',error);
  }
  async download(version) {
    this.ready=false;
    const result=await this.updater.checkForUpdates();
    if(!result || result.updateInfo.version!==version)throw Error('The available update changed. Check for updates again.');
    const files=await this.updater.downloadUpdate();
    if(!files?.length)throw Error('The update did not finish downloading.');
    this.ready=true;
  }
  install() {
    if(!this.ready)throw Error('Download and verify the update first.');
    this.updater.quitAndInstall(true,true);
  }
}
module.exports={NativeUpdates};
