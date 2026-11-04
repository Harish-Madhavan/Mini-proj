/**
 * Frozen chain-fact snapshots for established forensic-corpus transaction IDs.
 * Captured from confirmed explorer responses; labels and ownership claims are
 * deliberately excluded. Re-capture and review before changing these values.
 */
const freezeReference = reference => Object.freeze({
  ...reference,
  source: Object.freeze(reference.source),
  outputs: Object.freeze(reference.outputs.map(output => Object.freeze(output))),
});

export const CHAIN_FACT_BENCHMARKS = Object.freeze([
  {
    "id": "genesis",
    "txid": "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
    "blockHeight": 0,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:45.283Z",
      "endpoint": "https://blockstream.info/api/tx/4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
      "canonicalResponseSha256": "SHA256:6DB1F7ED4A5D71B5F7ECFBA494F5225A2B147CD5BADC4F2ECEF48155B60737F9"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 5000000000,
        "traceIdentifier": "1_P2PK_04678afd...f11d5f",
        "scriptType": "p2pk"
      }
    ]
  },
  {
    "id": "first-tx",
    "txid": "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
    "blockHeight": 170,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:45.515Z",
      "endpoint": "https://blockstream.info/api/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
      "canonicalResponseSha256": "SHA256:6A0753DFED5837FF33DDF52E925F04083B13193F2DB87E99A4A7D833BB3A0D3D"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 1000000000,
        "traceIdentifier": "1_P2PK_04ae1a62...6cd84c",
        "scriptType": "p2pk"
      },
      {
        "outputIndex": 1,
        "valueSats": 4000000000,
        "traceIdentifier": "1_P2PK_0411db93...b412a3",
        "scriptType": "p2pk"
      }
    ]
  },
  {
    "id": "pizza",
    "txid": "a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d",
    "blockHeight": 57043,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:45.846Z",
      "endpoint": "https://blockstream.info/api/tx/a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d",
      "canonicalResponseSha256": "SHA256:1EABCE2BEF7D1C579E419ED84068F634A41575105357056990A90CCDEF864795"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 1000000000000,
        "traceIdentifier": "17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ",
        "scriptType": "p2pkh"
      }
    ]
  },
  {
    "id": "pizza-spend",
    "txid": "cca7507897abc89628f450e8b1e0c6fca4ec3f7b34cccf55f3f531c659ff4d79",
    "blockHeight": 57044,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:46.076Z",
      "endpoint": "https://blockstream.info/api/tx/cca7507897abc89628f450e8b1e0c6fca4ec3f7b34cccf55f3f531c659ff4d79",
      "canonicalResponseSha256": "SHA256:9A2C7E83F112172268FF188660793661A29AE6F4B3EB68CFF3D1B53EB04E991A"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 577700000000,
        "traceIdentifier": "1MLh2UVHgonJY4ZtsakoXtkcXDJ2EPU6RY",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 1,
        "valueSats": 422300000000,
        "traceIdentifier": "1_P2PK_04cd5e97...8d455d",
        "scriptType": "p2pk"
      }
    ]
  },
  {
    "id": "batch",
    "txid": "4f11f4965a2e5a61407c4f9a68db803b8e8d5bb3ffb85f6de17a61159176d042",
    "blockHeight": 959467,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:46.599Z",
      "endpoint": "https://blockstream.info/api/tx/4f11f4965a2e5a61407c4f9a68db803b8e8d5bb3ffb85f6de17a61159176d042",
      "canonicalResponseSha256": "SHA256:A87510440038F92FFA57FC4D3946B8F93C9652FC5284565AA65AE23566A549A5"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qvee8xk9mz90gc2qnaj2sn95swt4yp5yqfeq3cn",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 1,
        "valueSats": 155894,
        "traceIdentifier": "bc1qwsjkz42up3a00dpyx6t46kt7wl0fy527epyqtv",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 2,
        "valueSats": 43335,
        "traceIdentifier": "bc1q350zfmgglp5ehm0vqusk88frjyny7we3jnknlq",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 3,
        "valueSats": 34003,
        "traceIdentifier": "bc1qny36yyq0uz73sk0nrkxlrkyvgq5hxy8lp7t4mj",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 4,
        "valueSats": 48323,
        "traceIdentifier": "bc1q8ppcnm6egqdhh6u7srp2fkjm028dl0lm6f94k0",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 5,
        "valueSats": 233837,
        "traceIdentifier": "bc1qcyens47fpfke7hpseszackdmmy6dxz7qau8lgk",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 6,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q9vpagpwzyufn8rcgvf2vdf7lhhxs5djf7cxv2p",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 7,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q406xq4748p3rhawhxtpv66fq57tn64usvq9lvv",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 8,
        "valueSats": 40344,
        "traceIdentifier": "bc1q7pwyt9pgm8clepqur7kpegmj5hs6dm45uhwjax",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 9,
        "valueSats": 1558801,
        "traceIdentifier": "bc1qjlgucw4uldm247kw3xgv3rg49v52t8lch928e0",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 10,
        "valueSats": 722950484,
        "traceIdentifier": "bc1q0u4dan3c4vzxhtmmgscul48m5qcey4msyq7306",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 11,
        "valueSats": 516750,
        "traceIdentifier": "bc1qh5z832p2240n6devcy95n8lew30n3ral7afpcs",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 12,
        "valueSats": 187043,
        "traceIdentifier": "bc1qtlcugy47yddpmygptd7nc20fw8y7gclrtrtk80",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 13,
        "valueSats": 18463,
        "traceIdentifier": "bc1qeuv0amcx8eu07lapr30qsvpg8qg6cjaa92v3us",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 14,
        "valueSats": 383679,
        "traceIdentifier": "bc1qesmsuk2ltfwcuyns2vyefg3cyvvctsu9ckrtr4",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 15,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qw550jegyflfespqgq8hql24ljtwrdm75pft9te",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 16,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qnjr36th7a3crtm5fd2p7d9494duk5anqq629r9",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 17,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qef5jzjzn5ryn28w83lw8duha86xy3lef3tnn3k",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 18,
        "valueSats": 122129,
        "traceIdentifier": "bc1qej35q4yv845z2wz68fpye2ctr0z8jamtvn5j22",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 19,
        "valueSats": 155880,
        "traceIdentifier": "bc1qjemcugmcrmeklcmf0kpss5ahtfvgdrdxfx7295",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 20,
        "valueSats": 155880,
        "traceIdentifier": "bc1qydvyug26m2wqrc4qqfnkuasnzhds9xg5pwhdh7",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 21,
        "valueSats": 35852,
        "traceIdentifier": "bc1qcd550muusxsny0l7u5nt0dfrq6dzds8knxtpw9",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 22,
        "valueSats": 49882,
        "traceIdentifier": "bc1qfz2908f9zly6dzvaashtkq7wzw2s3ythqcqv2z",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 23,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q2m3nj64pete4quy20lha6x2n6pdt6kyhud9w96",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 24,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q9590kt2d7wwr64k0xqqq4zvk5e3cyt249lr5rk",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 25,
        "valueSats": 155899,
        "traceIdentifier": "1NedDWKhma3xqUxm3bnwSenG5YH1i4yoZH",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 26,
        "valueSats": 232282,
        "traceIdentifier": "bc1qz8un97cd88fktv3q66davlz89uhz6k8nhfllwy",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 27,
        "valueSats": 239975,
        "traceIdentifier": "39VHdw1V8TwsG2yTHiKANoBN7y4ALQDBm1",
        "scriptType": "p2sh"
      },
      {
        "outputIndex": 28,
        "valueSats": 43620,
        "traceIdentifier": "bc1q0ld7s8cw9ca0kev5h909cnp239h9h63ge4cmj5",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 29,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q4r75y0ddc459umyz8xxu432qynn2fkyzltkk08",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 30,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qwllfl8pzjdvuxjvr9sxzl0ghnuy570fegp5esu",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 31,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1ql875f9j7wjzqrsm8wl7n0agsvlwa68a0u4r6h7",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 32,
        "valueSats": 132336,
        "traceIdentifier": "bc1qfyayrxzu23aawpz5uqjwstlc7m63ae0qqqg6ty",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 33,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qe709x9kak7mp4yzl85407khlfzdf8ecyy9ufm7",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 34,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qnd26kgm4waundjungwd46x808kvmpwul8mlar3",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 35,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qptx86haxhkam4elm06cunv2x2usglhk93m7pgt",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 36,
        "valueSats": 58406,
        "traceIdentifier": "bc1q9n888fslk8j9rjhv0masp9vlr8364wr4w435k7",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 37,
        "valueSats": 7527063,
        "traceIdentifier": "bc1qquyznpz4u4sj09fsce5jsa6z3et9qypcwwg45a",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 38,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q78ktfn7eprlwf28r0vw6y8slhhjzdc490xjdpw",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 39,
        "valueSats": 549531,
        "traceIdentifier": "bc1qgv5q49d5pjjqy4ccfc48fgne68ae8udvwzsvh9",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 40,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qn5gektse8sppwl3udwx4y2nax2zsu6cdmzkum9",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 41,
        "valueSats": 132506,
        "traceIdentifier": "1HB5XMLmzFVj8ALj6mfBsbifRoD4miY36v",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 42,
        "valueSats": 77940,
        "traceIdentifier": "bc1q6dc8xfrvvnls5gtdadd5xkgcw5vfsf6hss93qe",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 43,
        "valueSats": 77940,
        "traceIdentifier": "bc1q857d4d4jus97jg4cm8puupvkgq8ukp8zncxpua",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 44,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1q33ncjsxjjsr4pgtvhj3j25k8tac4ggdrmz0azd",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 45,
        "valueSats": 26500,
        "traceIdentifier": "bc1qpyn98erylv4yh7ysdy5lvxqyw2zkyxhpzv7knm",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 46,
        "valueSats": 307121,
        "traceIdentifier": "bc1q6vzyr4gvzfvfdxnaqcmnrud2zqhldslyrp8rhv",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 47,
        "valueSats": 4370417811,
        "traceIdentifier": "bc1qactqjuk4kghfgaqqt454hzzzs5lsaysunf80gh",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 48,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qv63ju4d4kqmjzd77z2e77mqvtrak4mch9d9gt5",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 49,
        "valueSats": 428970,
        "traceIdentifier": "bc1q0uq9udgpf7m0dtdq5y0av8v0vrmh250a5gzzje",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 50,
        "valueSats": 272495,
        "traceIdentifier": "bc1qx50c9k78mmx4waqaq5zqh7p9mp4neszqxs7rhs",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 51,
        "valueSats": 46559,
        "traceIdentifier": "bc1q6gre56fw57tv0wcr0e4m6gw80sjryk85spw5nk",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 52,
        "valueSats": 147168,
        "traceIdentifier": "bc1qxk4pau8zw6hxuwq8npfx2xzrwm8na3r5q706ut",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 53,
        "valueSats": 152762,
        "traceIdentifier": "bc1q03djak5ddzn5xe223k9kgw0hv5d8nfce6e57z5",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 54,
        "valueSats": 1000000000,
        "traceIdentifier": "bc1qa66jzmz9qchljfmg6nq9u70zumgtr7g0pplrrz",
        "scriptType": "v0_p2wpkh"
      },
      {
        "outputIndex": 55,
        "valueSats": 15950,
        "traceIdentifier": "3NfimhbmwcoaFR4qhzNpejsJomrE6zzp5s",
        "scriptType": "p2sh"
      },
      {
        "outputIndex": 56,
        "valueSats": 441587,
        "traceIdentifier": "bc1q6hpnyjq3wjfm9emnpug8hrr8zudgfzgmjjz9s8",
        "scriptType": "v0_p2wpkh"
      }
    ]
  },
  {
    "id": "ransom-sweep",
    "txid": "35e5d5fe8c8128cfa6884f56be5817e4138c58c91b79d78d3e78a8d365b9d8a7",
    "blockHeight": 478796,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:46.881Z",
      "endpoint": "https://blockstream.info/api/tx/35e5d5fe8c8128cfa6884f56be5817e4138c58c91b79d78d3e78a8d365b9d8a7",
      "canonicalResponseSha256": "SHA256:9A394A63A2C18575781AE4399D228BC44E6A49B79D564172084B144FC9163D06"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 902796322,
        "traceIdentifier": "16dfTuSx4f78eQ81PzTgBtBDyZ7QhNZ8Vy",
        "scriptType": "p2pkh"
      }
    ]
  },
  {
    "id": "peel-split",
    "txid": "2b22df65026d8384e01e0deb9b115ba9725bbe9d95c4f61d18dee6e40fa47b74",
    "blockHeight": 478829,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:47.120Z",
      "endpoint": "https://blockstream.info/api/tx/2b22df65026d8384e01e0deb9b115ba9725bbe9d95c4f61d18dee6e40fa47b74",
      "canonicalResponseSha256": "SHA256:3155CAC4B7E803AA92089940D207C15C044E460561558EA152FD2913347BB881"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 329381,
        "traceIdentifier": "1HG7gDBAYnPCJBC7eiwhX9dNRVi1c5naou",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 1,
        "valueSats": 902445824,
        "traceIdentifier": "1P2SbiV5zKAwMTZH1VdExXM2sXRjkCeTsx",
        "scriptType": "p2pkh"
      }
    ]
  },
  {
    "id": "sweep-split",
    "txid": "409803bb5e124fd028c0482027c7722e84ce55b78204b279d3a44aba5e7c1698",
    "blockHeight": 478795,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:47.371Z",
      "endpoint": "https://blockstream.info/api/tx/409803bb5e124fd028c0482027c7722e84ce55b78204b279d3a44aba5e7c1698",
      "canonicalResponseSha256": "SHA256:0BCF8B069E946404B737889438FD281F76D9C3952566570FEFCA2DD43554C676"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 1227173,
        "traceIdentifier": "1JC41YHmjKEcW1rLH6pmMWEFHkoNwSmhnC",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 1,
        "valueSats": 871529348,
        "traceIdentifier": "1FQQ86tMuvhQ4Ruyggbb8j7iaNfUZ69gpY",
        "scriptType": "p2pkh"
      }
    ]
  },
  {
    "id": "bitfinex-sweep-592",
    "txid": "e6088723889de70fa985e7b8c012c77ea693a6ef9379fb26a951a2bb5c722525",
    "blockHeight": 721292,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:48.204Z",
      "endpoint": "https://blockstream.info/api/tx/e6088723889de70fa985e7b8c012c77ea693a6ef9379fb26a951a2bb5c722525",
      "canonicalResponseSha256": "SHA256:7F50221D5B1830392A3B0F4905DEF3A669D00DAD2B37C2C8D112B6916F356B29"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 452019700,
        "traceIdentifier": "1CZ7VXJBG7TcZ5UHs7HN4JHSJGHAtqwR6u",
        "scriptType": "p2pkh"
      },
      {
        "outputIndex": 1,
        "valueSats": 1000000000000,
        "traceIdentifier": "bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt",
        "scriptType": "v0_p2wpkh"
      }
    ]
  },
  {
    "id": "silkroad-seizure-move",
    "txid": "3f036ff88bb851b57a1e28780dbce35a6457a8b57995c095b55b3b0cf48ba9fd",
    "blockHeight": 655283,
    "source": {
      "provider": "Blockstream",
      "retrievedAt": "2026-11-04T03:48:48.440Z",
      "endpoint": "https://blockstream.info/api/tx/3f036ff88bb851b57a1e28780dbce35a6457a8b57995c095b55b3b0cf48ba9fd",
      "canonicalResponseSha256": "SHA256:C7644EB3662059591801182E14CBED63B7417DB8C29671137E2B05644178EEBE"
    },
    "outputs": [
      {
        "outputIndex": 0,
        "valueSats": 6936916628020,
        "traceIdentifier": "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6",
        "scriptType": "v0_p2wpkh"
      }
    ]
  }
].map(freezeReference));
