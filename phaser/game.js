/*
 * シンプルな星集めゲーム
 * プレイヤーは矢印キーで左右に移動し、ジャンプして
 * 落ちてくる星を集めます。すべての星を集めると爆弾が出現し、
 * 爆弾に触れるとゲームオーバーになります。
 */

// グローバル変数を定義
let player;
let cursors;
let platforms;
let stars;
let bombs;
let score = 0;
let scoreText;
let gameOver = false;

class CatchStarsScene extends Phaser.Scene {
    constructor() {
        super('CatchStarsScene');
    }

    preload() {
        // 外部ホストからゲーム用の画像を読み込む
        // チュートリアルではローカル assets に置いていますが、
        // ここでは labs.phaser.io の公開アセットを使用します。
        // 各画像はチュートリアルのサンプルと同じものです【239695174043344†L55-L65】。
        this.load.image('sky', 'https://labs.phaser.io/src/games/firstgame/assets/sky.png');
        this.load.image('ground', 'https://labs.phaser.io/src/games/firstgame/assets/platform.png');
        this.load.image('star', 'https://labs.phaser.io/src/games/firstgame/assets/star.png');
        this.load.image('bomb', 'https://labs.phaser.io/src/games/firstgame/assets/bomb.png');
        // プレイヤースプライトシートは幅32、高さ48ピクセルの8フレームで構成されています
        this.load.spritesheet('dude', 'https://labs.phaser.io/src/games/firstgame/assets/dude.png', {
            frameWidth: 32,
            frameHeight: 48
        });
    }

    create() {
        // 背景画像を中央に配置
        this.add.image(400, 300, 'sky');

        // 物理エンジン付きのプラットフォーム（静的グループ）を作成
        platforms = this.physics.add.staticGroup();
        // スケールを 2 倍にして地面を伸ばします
        platforms.create(400, 568, 'ground').setScale(2).refreshBody();
        // いくつかの足場を配置
        platforms.create(600, 400, 'ground');
        platforms.create(50, 250, 'ground');
        platforms.create(750, 220, 'ground');

        // プレイヤーを作成し物理プロパティを設定
        player = this.physics.add.sprite(100, 450, 'dude');
        player.setBounce(0.2);
        player.setCollideWorldBounds(true);

        // プレイヤーのアニメーションを定義
        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1
        });
        this.anims.create({
            key: 'turn',
            frames: [{ key: 'dude', frame: 4 }],
            frameRate: 20
        });
        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('dude', { start: 5, end: 8 }),
            frameRate: 10,
            repeat: -1
        });

        // キーボード入力を作成【348571649852873†L54-L83】
        cursors = this.input.keyboard.createCursorKeys();

        // 星のグループを作成してバウンスを与える【352779953952720†L48-L89】。
        stars = this.physics.add.group({
            key: 'star',
            repeat: 11,
            setXY: { x: 12, y: 0, stepX: 70 }
        });
        stars.children.iterate(function (child) {
            // ランダムなバウンス値を設定することで跳ね返り具合が変わります
            child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
        });

        // 爆弾のグループ。個別に追加するため空で作成
        bombs = this.physics.add.group();

        // スコアを初期化しテキストオブジェクトを作成【862870811403335†L48-L77】
        score = 0;
        scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', fill: '#000' });

        // 衝突判定を追加
        this.physics.add.collider(player, platforms);
        this.physics.add.collider(stars, platforms);
        this.physics.add.collider(bombs, platforms);

        // 星とプレイヤーの重なりを検知し、関数 collectStar を呼び出す
        this.physics.add.overlap(player, stars, this.collectStar, null, this);
        // プレイヤーと爆弾の衝突を検知し、ゲームオーバー処理を呼び出す
        this.physics.add.collider(player, bombs, this.hitBomb, null, this);
    }

    update() {
        // ゲームオーバー時は何もしません
        if (gameOver) {
            return;
        }

        // 左右キーで移動させる【348571649852873†L60-L76】
        if (cursors.left.isDown) {
            player.setVelocityX(-160);
            player.anims.play('left', true);
        } else if (cursors.right.isDown) {
            player.setVelocityX(160);
            player.anims.play('right', true);
        } else {
            player.setVelocityX(0);
            player.anims.play('turn');
        }

        // 上キーでジャンプさせる。足場に接しているときだけジャンプ可能【348571649852873†L79-L83】
        if (cursors.up.isDown && player.body.touching.down) {
            player.setVelocityY(-330);
        }
    }

    // 星を集めたときの処理【862870811403335†L68-L77】【350392941581111†L80-L117】
    collectStar(player, star) {
        // 星を非表示にして物理演算から除外
        star.disableBody(true, true);

        // スコアを加算しテキストを更新
        score += 10;
        scoreText.setText('Score: ' + score);

        // すべての星を集めたら新たに星を再配置し、爆弾を出現させる
        if (stars.countActive(true) === 0) {
            // 星を再有効化し上から落とす
            stars.children.iterate(function (child) {
                child.enableBody(true, child.x, 0, true, true);
            });

            // プレイヤーの位置によって爆弾の出現位置を決定
            const x = (player.x < 400) ? Phaser.Math.Between(400, 800) : Phaser.Math.Between(0, 400);
            const bomb = bombs.create(x, 16, 'bomb');
            bomb.setBounce(1);
            bomb.setCollideWorldBounds(true);
            // ランダムな速度を設定し、重力の影響を受けないようにする
            bomb.setVelocity(Phaser.Math.Between(-200, 200), 20);
            bomb.allowGravity = false;
        }
    }

    // 爆弾に当たったときの処理【350392941581111†L69-L76】
    hitBomb(player, bomb) {
        // 物理演算を停止しゲームオーバーにする
        this.physics.pause();
        player.setTint(0xff0000);
        player.anims.play('turn');
        gameOver = true;
    }
}

// ゲーム設定
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scene: CatchStarsScene
};

// ゲームインスタンスの生成
const game = new Phaser.Game(config);
