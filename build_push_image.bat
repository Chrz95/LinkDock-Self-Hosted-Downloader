docker buildx create --use  --buildkitd-config ./buildkitd.toml
docker buildx build  --platform linux/amd64,linux/arm64/v8 -t 192.168.1.11:5000/link_dock:latest --push .