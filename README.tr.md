# IssueHarbor

IssueHarbor, GitHub issue başlık ve açıklamalarını açıkça tanımlanmış anahtar kelime kurallarıyla etiketleyen bir GitHub Action'dır. Issue metinlerini harici servislere göndermez ve bot hesabına geniş depo izinleri vermeyi gerektirmez.

[English README](README.md) · [Workflow örneği](docs/workflow-example.yml) · [Güvenlik politikası](SECURITY.md)

## Özellikler

- Yeni açılan issue'ları ve başlık/açıklama düzenlemelerini işler.
- Büyük-küçük harf ve noktalama işaretlerini yok sayarak kelime veya ifade eşleştirir.
- Eşleşen etiketleri mevcut etiketlere ekler; mevcut etiketleri kaldırmaz.
- `dry-run` ile yazma isteği göndermeden sonuçları önizler.
- Node.js 24 ile çalışır ve çalışma anında npm bağımlılığı kullanmaz.
- Pull request'leri, yorum yazmayı, atama yapmayı, kapatmayı ve etiket silmeyi desteklemez.

## Kurulum

1. GitHub deponuzda `bug`, `question` gibi uygulanmasını istediğiniz etiketleri oluşturun.
2. `.github/issue-harbor.json` dosyasını ekleyin. Başlangıç için [örnek yapılandırmayı](.github/issue-harbor.example.json) kopyalayıp düzenleyin.
3. `.github/workflows/issue-harbor.yml` dosyasına aşağıdaki iş akışını ekleyin:

```yaml
name: Label community issues

on:
  issues:
    types: [opened, edited]

permissions:
  contents: read
  issues: write

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: euglado/issue-harbor@v1
        with:
          token: ${{ github.token }}
          config-path: .github/issue-harbor.json
```

Başlangıçta action adımına `dry-run: 'true'` ekleyerek eşleşmeleri inceleyin. Beklediğiniz sonucu alınca kaldırın veya `false` yapın.

## Yapılandırma

```json
{
  "version": 1,
  "rules": [
    { "label": "bug", "keywords": ["crash", "does not work"] },
    { "label": "question", "keywords": ["how do I", "help"] }
  ]
}
```

Bir kural, başlık veya açıklamadaki anahtar kelimelerden herhangi biri geçerse eşleşir. Birden fazla kural eşleşirse bütün ilgili etiketler eklenir. Eşleştirme düzenli ifade çalıştırmaz; kullanıcı metnini komut olarak yorumlamaz. Yapılandırma en fazla 100 kural, kural başına 20 anahtar kelime ve anahtar kelime başına 100 karakter içerebilir.

## İzin ve gizlilik

İş akışında `contents: read` ve `issues: write` izinleri yeterlidir. Token günlük çıktısına yazılmaz. Başlık ve açıklama GitHub Actions çalışma alanında değerlendirilir; IssueHarbor bunları üçüncü taraf bir servise göndermez.

## Geliştirme

Node.js 24 veya üstünü kurup şu komutları çalıştırın:

```sh
npm ci
npm run check
npm audit --audit-level=high
```

Testler Node'un yerleşik test aracını ve taklit edilmiş API yanıtlarını kullanır; GitHub hesabı ya da ağ bağlantısı gerekmez. Ayrıntılar için [katkı yönergelerini](CONTRIBUTING.md) okuyun.

## Lisans

[MIT lisansı](LICENSE)
