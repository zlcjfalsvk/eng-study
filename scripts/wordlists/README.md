# 워드리스트

`pnpm generate --level <level> --wordlist scripts/wordlists/<file>.txt` 로 사용합니다.

형식: 한 줄에 하나, `headword` 또는 `headword,type` (type: word | phrasal | idiom | collocation).
`#` 으로 시작하는 줄은 주석. 공백이 포함된 표제어는 type 을 생략하면 phrasal 로 간주합니다.

예:
```
# business
leverage
follow up,phrasal
meet a deadline,collocation
```

워드리스트가 없으면 생성 스크립트가 Claude 에게 레벨에 맞는 후보 표제어를 제안받아 사용합니다.
CEFR 기반 공개 목록(예: Oxford 3000/5000, NGSL)을 여기 넣으면 레벨 배정의 일관성이 좋아집니다.
