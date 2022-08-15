((root) => {
    root.config = {
        //你的 osu! 歌曲路径，注意反斜杠要打两个 \\
        //如果你的 osu! 是默认安装位置，那只需要把 <username> 改成你的 Windows 用户文件夹即可。
        osuSongsPath: "C:\\Users\\<username>\\AppData\\Local\\osu!\\Songs\\",
        // 使用的字体，需要在系统中有对应字体，可以打开系统字体目录里查看
        font: "JetBrains Mono",
        // PP 曲线图 Y 坐标是否从 0 开始，若不从 0 开始，将自动选择 PP 曲线和 PP 值的最低点开始。
        curveYAxiosStartFromZero: true,
    }
})(this);

