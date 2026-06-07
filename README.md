# NT548 - Lab 2 - Câu 3: CI/CD cho ứng dụng microservices Kanban

Ứng dụng Kanban board gồm 3 microservices, được build, test và deploy tự động
bằng GitHub Actions lên Kubernetes (kind), tích hợp SonarCloud (SonarQube
Cloud) kiểm tra chất lượng mã và Trivy quét bảo mật image.

## Kiến trúc ứng dụng

```text
┌──────────────┐      ┌───────────────┐      ┌─────────┐
│   frontend   │ ───► │  task-service │ ───► │  Redis  │
│ Node/Express │      │ Python/Flask  │      └─────────┘
│  UI Kanban   │      │  CRUD tasks   │           ▲
└──────────────┘      └───────────────┘           │
        │             ┌───────────────┐           │
        └───────────► │ stats-service │ ──────────┘
                      │ Python/Flask  │
                      │  thống kê     │
                      └───────────────┘
```

| Service | Stack | Vai trò |
| --- | --- | --- |
| `frontend` | Node.js + Express | Giao diện Kanban (kéo thả 3 cột), proxy API |
| `task-service` | Python + Flask | REST API CRUD task, lưu Redis |
| `stats-service` | Python + Flask | API thống kê số task theo cột |
| `redis` | Redis 7 | Lưu trữ dữ liệu task |

Mỗi service có Dockerfile và unit test riêng (`pytest` cho Python,
`node --test` cho Node).

## Pipeline CI/CD (`.github/workflows/cicd.yml`)

```text
push main ──► test ──► sonarcloud ──► build-push (x3 service) ──► deploy
              │            │             │  build image            │
  unit test 3 service   SonarCloud      │  Trivy scan             │
  + coverage            Quality Gate    │  push GHCR              │
                                        ▼                          ▼
                              GitHub-hosted runner       self-hosted runner
                                                         (máy có cluster kind)
```

- **test**: chạy unit test cả 3 service, xuất coverage cho SonarCloud.
- **sonarcloud**: quét chất lượng mã trên SonarCloud (bản cloud của SonarQube).
- **build-push**: build Docker image từng service (matrix), quét lỗ hổng bằng
  Trivy, push lên GitHub Container Registry với tag là commit SHA và `latest`.
- **deploy**: chạy trên self-hosted runner — pull image, nạp vào cluster kind,
  `kubectl apply` manifests, chờ rollout rồi smoke test qua NodePort.

Pull request chỉ chạy test + SonarCloud; build và deploy chỉ chạy khi push
vào `main`.

## Chuẩn bị

### 1. Cluster Kubernetes (kind)

```bash
cat <<'EOF' > kind-kanban.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: kanban
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 30080
        protocol: TCP
  - role: worker
EOF
kind create cluster --config kind-kanban.yaml
```

Port 30080 được map ra máy host để truy cập frontend qua NodePort.

### 2. SonarCloud

1. Đăng nhập <https://sonarcloud.io> bằng tài khoản GitHub.
2. Import repository này, lấy `organization` và `projectKey` rồi cập nhật
   vào `sonar-project.properties`.
3. Tắt Automatic Analysis (Administration → Analysis Method) để dùng CI.
4. Tạo token (My Account → Security) và thêm vào GitHub repo secret
   `SONAR_TOKEN`.

### 3. Self-hosted runner

Vào **Settings → Actions → Runners → New self-hosted runner**, làm theo
hướng dẫn cho Linux x64. Máy chạy runner cần có sẵn: `docker`, `kind`,
`kubectl` (context `kind-kanban`).

```bash
./config.sh --url https://github.com/<owner>/<repo> --token <token>
./run.sh
```

## Chạy thử local (không cần CI)

```bash
# Unit test
(cd task-service && pip install -r requirements-dev.txt && pytest)
(cd stats-service && pip install -r requirements-dev.txt && pytest)
(cd frontend && npm install && npm test)

# Build image và deploy vào kind
for svc in frontend task-service stats-service; do
  docker build -t ghcr.io/<owner>/kanban-$svc:latest $svc
  kind load docker-image ghcr.io/<owner>/kanban-$svc:latest --name kanban
done
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/
```

Mở <http://localhost:30080> để dùng bảng Kanban.

## Xóa tài nguyên

```bash
kubectl delete namespace kanban   # xóa app
kind delete cluster --name kanban # xóa cả cluster
```
