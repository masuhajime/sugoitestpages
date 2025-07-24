/*
 * 2D ゴルフゲーム
 *
 * このゲームではプレイヤーが角度とパワーを決めてボールを打ち、
 * 3 つのホールをプレイします。矢印キーではなく、画面クリック（またはスペースバー）で
 * 角度決定→パワー決定→ショットの流れを進めます。ボールが静止したら再び角度とパワーを
 * 決め、全てのホールに入ると合計打数を表示しリトライが可能です。
 */

class GolfGame extends Phaser.Scene {
    constructor() {
        super('GolfGame');
        // ワールド幅（カメラ追従のためステージは横に広い）
        this.worldWidth = 1600;
        // ゲームの状態
        this.phase = 'angle';        // 'angle', 'power', 'ballMoving', 'holeComplete', 'finished'
        this.stageIndex = 0;         // 現在のホール番号
        this.strokes = [0, 0, 0];    // 各ホールの打数
        this.selectedAngle = 0;      // 選択した角度（度数）
        this.selectedPower = 0;      // 選択したパワー（0〜1）
        this.angleTime = 0;          // 矢印アニメーションの時間計測
        this.powerValue = 0;         // 現在のゲージ値（0〜1）
        this.powerDirection = 1;     // ゲージ増減方向
    }

    preload() {
        // 背景画像を読み込みます。生成した画像は同ディレクトリにあります。
        this.load.image('background', 'golf_background.png');
    }

    create() {
        // 物理ワールドとカメラの境界を設定
        this.physics.world.setBounds(0, 0, this.worldWidth, 600);
        this.cameras.main.setBounds(0, 0, this.worldWidth, 600);

        // 背景を追加（ワールド幅に合わせて拡大）
        const bg = this.add.image(0, 0, 'background').setOrigin(0, 0);
        bg.setDisplaySize(this.worldWidth, 600);

        // ゴルフボール用のテクスチャを動的に生成
        const ballGraphics = this.add.graphics();
        ballGraphics.fillStyle(0xffffff, 1);
        ballGraphics.fillCircle(8, 8, 8);
        ballGraphics.generateTexture('golfBall', 16, 16);
        ballGraphics.destroy();

        // 障害物用のテクスチャ（長方形）を生成
        const blockGraphics = this.add.graphics();
        blockGraphics.fillStyle(0x654321, 1);
        blockGraphics.fillRect(0, 0, 100, 20);
        blockGraphics.generateTexture('block', 100, 20);
        blockGraphics.destroy();

        // UI テキスト
        this.statusText = this.add.text(16, 16, '', { fontSize: '20px', fill: '#000' }).setScrollFactor(0);

        // パワーゲージ背景とゲージ本体
        this.powerBarBg = this.add.graphics().setScrollFactor(0);
        this.powerBar = this.add.graphics().setScrollFactor(0);
        const barX = 300;
        const barY = 50;
        const barWidth = 200;
        const barHeight = 20;
        // 背景を一度だけ描画
        this.powerBarBg.fillStyle(0x777777, 0.5);
        this.powerBarBg.fillRect(barX, barY, barWidth, barHeight);
        this.powerBarBg.lineStyle(2, 0x000000, 1);
        this.powerBarBg.strokeRect(barX, barY, barWidth, barHeight);
        this.barConfig = { x: barX, y: barY, w: barWidth, h: barHeight };

        // 矢印用グラフィックス
        this.arrowGraphics = this.add.graphics();

        // インプットイベント
        this.input.on('pointerdown', this.handleInput, this);
        this.input.keyboard.on('keydown-SPACE', this.handleInput, this);

        // ボール生成（プレースホルダ、setupHole で位置セット）
        this.ball = this.physics.add.image(0, 0, 'golfBall');
        // ボール物理設定
        this.ball.setCircle(8);
        this.ball.setBounce(0.4);
        this.ball.setCollideWorldBounds(true);
        this.ball.setDamping(true);
        this.ball.setDrag(0.99, 0.99);
        this.ball.setMaxVelocity(1000, 1000);

        // 障害物グループ
        this.obstacles = this.physics.add.staticGroup();

        // ホールの円（描画用）
        this.holeGraphic = null;
        this.holeData = null;

        // ホール定義
        this.holes = [
            {
                start: { x: 100, y: 520 },
                hole: { x: 1300, y: 520, r: 18 },
                obstacles: []
            },
            {
                start: { x: 100, y: 520 },
                hole: { x: 1300, y: 350, r: 18 },
                obstacles: [
                    { x: 500, y: 450, w: 200, h: 20 },
                    { x: 900, y: 300, w: 200, h: 20 }
                ]
            },
            {
                start: { x: 100, y: 520 },
                hole: { x: 1300, y: 200, r: 18 },
                obstacles: [
                    { x: 400, y: 480, w: 250, h: 20 },
                    { x: 750, y: 350, w: 250, h: 20 },
                    { x: 1100, y: 260, w: 20, h: 200 }
                ]
            }
        ];

        // プレイ開始
        this.startHole(this.stageIndex);
    }

    // 新しいホールをセットアップします
    startHole(index) {
        // UI 更新
        this.statusText.setText(`Hole ${index + 1} / 3  -  Stroke: ${this.strokes[index]}`);
        // 障害物を一旦クリア
        this.obstacles.clear(true, true);
        // 既存のホール円を削除
        if (this.holeGraphic) {
            this.holeGraphic.destroy();
            this.holeGraphic = null;
        }
        // ホールデータセット
        this.holeData = this.holes[index];
        // ボール位置リセット
        this.ball.setPosition(this.holeData.start.x, this.holeData.start.y);
        this.ball.setVelocity(0, 0);
        this.ball.setAngularVelocity(0);
        // カメラを初期位置に戻し追従停止
        this.cameras.main.stopFollow();
        this.cameras.main.setScroll(0, 0);
        // 障害物を生成
        this.holeData.obstacles.forEach((obs) => {
            // 障害物画像の中心座標を計算
            const ox = obs.x + obs.w / 2;
            const oy = obs.y + obs.h / 2;
            const block = this.physics.add.staticImage(ox, oy, 'block');
            block.setDisplaySize(obs.w, obs.h);
            block.refreshBody();
            this.obstacles.add(block);
        });
        // ボールと障害物の衝突設定
        this.physics.add.collider(this.ball, this.obstacles);
        // ホールグラフィックを描画
        this.holeGraphic = this.add.graphics();
        this.holeGraphic.fillStyle(0x000000, 1);
        this.holeGraphic.fillCircle(this.holeData.hole.x, this.holeData.hole.y, this.holeData.hole.r);
        // 状態を初期状態に
        this.phase = 'angle';
        this.selectedAngle = 0;
        this.selectedPower = 0;
        this.angleTime = 0;
        this.powerValue = 0;
        this.powerDirection = 1;
        // 矢印とゲージを表示
        this.arrowGraphics.setVisible(true);
        this.powerBar.setVisible(true);
    }

    // 入力処理
    handleInput() {
        if (this.phase === 'angle') {
            // 角度決定
            this.selectedAngle = this.getArrowAngle();
            this.phase = 'power';
        } else if (this.phase === 'power') {
            // パワー決定 → 打つ
            this.selectedPower = this.powerValue;
            this.shootBall();
        } else if (this.phase === 'finished') {
            // リトライ: 最初から
            this.stageIndex = 0;
            this.strokes = [0, 0, 0];
            this.startHole(this.stageIndex);
            this.phase = 'angle';
            this.statusText.setText(`Hole 1 / 3  -  Stroke: 0`);
        }
    }

    // 矢印の現在の角度（度数）を計算
    getArrowAngle() {
        // angleTime に応じて 0〜90 度を往復する正弦波を使います
        const min = 0;
        const max = 90;
        const t = Math.sin(this.angleTime) * 0.5 + 0.5; // 0〜1
        return min + t * (max - min);
    }

    // ボールを打つ
    shootBall() {
        // ショット回数を増やす
        this.strokes[this.stageIndex] += 1;
        // UI 更新
        this.statusText.setText(`Hole ${this.stageIndex + 1} / 3  -  Stroke: ${this.strokes[this.stageIndex]}`);
        // 角度とパワーから速度を計算
        const angleDeg = this.selectedAngle;
        const angleRad = Phaser.Math.DegToRad(angleDeg);
        // 最大パワー係数（数値を調整するとゲームバランスが変わる）
        const maxPower = 600;
        const speed = this.selectedPower * maxPower;
        const vx = speed * Math.cos(angleRad);
        const vy = -speed * Math.sin(angleRad);
        this.ball.setVelocity(vx, vy);
        // カメラ追従開始
        this.cameras.main.startFollow(this.ball, true, 0.05, 0.05);
        // UI 表示を非表示に（角度矢印とゲージ）
        this.phase = 'ballMoving';
        this.arrowGraphics.clear();
        // ゲージを非表示に（再度表示する時に visible を戻す）
        this.powerBar.clear();
    }

    // ボールが停止したかチェック
    checkBallStopped() {
        // ボールの速度が十分小さいとき停止とみなす
        if (this.ball.body.speed < 15) {
            // ホール内かどうかチェック
            const hx = this.holeData.hole.x;
            const hy = this.holeData.hole.y;
            const r = this.holeData.hole.r;
            const dx = this.ball.x - hx;
            const dy = this.ball.y - hy;
            if (dx * dx + dy * dy < r * r) {
                // ホールに入った
                this.onHoleComplete();
            } else {
                // 停止 → 次のショット準備
                this.phase = 'angle';
                // 矢印とゲージを再表示する
                this.arrowGraphics.setVisible(true);
                this.powerBar.setVisible(true);
                // 角度・パワーの内部状態リセット
                this.angleTime = 0;
                this.powerValue = 0;
                this.powerDirection = 1;
                this.selectedAngle = 0;
                this.selectedPower = 0;
                // カメラをボールから外して最初の位置に戻す
                this.cameras.main.stopFollow();
            }
        }
    }

    // ホールクリア時の処理
    onHoleComplete() {
        // ホール数が残っていれば次へ、無ければゲーム終了
        if (this.stageIndex < this.holes.length - 1) {
            this.stageIndex += 1;
            this.startHole(this.stageIndex);
        } else {
            // 終了
            this.phase = 'finished';
            const total = this.strokes.reduce((a, b) => a + b, 0);
            this.statusText.setText(`Game Over!  Total Strokes: ${total}  (click to retry)`);
            // ボールを非表示に
            this.ball.setVisible(false);
            // ホールを非表示に
            if (this.holeGraphic) this.holeGraphic.setVisible(false);
            // ゲージ非表示
            this.powerBarBg.setVisible(false);
            this.powerBar.setVisible(false);
            this.arrowGraphics.setVisible(false);
        }
    }

    // ゲームループ
    update(time, delta) {
        // 角度選択中：矢印をアニメーション
        if (this.phase === 'angle') {
            this.angleTime += delta * 0.005; // スピード調整
            // 描画用角度を取得
            const deg = this.getArrowAngle();
            const rad = Phaser.Math.DegToRad(deg);
            // 矢印の長さ
            const length = 80;
            // ボール座標を基準に矢印端点を計算
            const x1 = this.ball.x;
            const y1 = this.ball.y;
            const x2 = x1 + Math.cos(rad) * length;
            const y2 = y1 - Math.sin(rad) * length;
            // 矢印描画
            this.arrowGraphics.clear();
            this.arrowGraphics.lineStyle(4, 0xff0000, 1);
            this.arrowGraphics.beginPath();
            this.arrowGraphics.moveTo(x1, y1);
            this.arrowGraphics.lineTo(x2, y2);
            this.arrowGraphics.strokePath();
            // 矢印の先端三角形
            const headLength = 12;
            const angleOffset = Math.PI / 8;
            const leftX = x2 - headLength * Math.cos(rad - angleOffset);
            const leftY = y2 + headLength * Math.sin(rad - angleOffset);
            const rightX = x2 - headLength * Math.cos(rad + angleOffset);
            const rightY = y2 + headLength * Math.sin(rad + angleOffset);
            this.arrowGraphics.fillStyle(0xff0000, 1);
            this.arrowGraphics.beginPath();
            this.arrowGraphics.moveTo(x2, y2);
            this.arrowGraphics.lineTo(leftX, leftY);
            this.arrowGraphics.lineTo(rightX, rightY);
            this.arrowGraphics.closePath();
            this.arrowGraphics.fillPath();
        }

        // パワー選択中：ゲージアニメーション
        if (this.phase === 'power') {
            // 値の更新
            const speed = 0.008; // ゲージの速さ
            this.powerValue += this.powerDirection * speed * delta;
            if (this.powerValue >= 1) {
                this.powerValue = 1;
                this.powerDirection = -1;
            } else if (this.powerValue <= 0) {
                this.powerValue = 0;
                this.powerDirection = 1;
            }
            // ゲージ描画
            this.powerBar.clear();
            this.powerBar.fillStyle(0x00aa00, 1);
            const fillW = this.barConfig.w * this.powerValue;
            this.powerBar.fillRect(this.barConfig.x, this.barConfig.y, fillW, this.barConfig.h);
        }

        // ボール移動中：停止チェック
        if (this.phase === 'ballMoving') {
            this.checkBallStopped();
        }
    }
}

// Phaser ゲーム設定
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
    scene: GolfGame
};

// ゲームを開始
new Phaser.Game(config);