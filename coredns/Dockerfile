FROM coredns/coredns:1.11.1

USER root
RUN apk --no-cache add ca-certificates curl dig
USER coredns

EXPOSE 53/udp 53/tcp 9153/tcp
ENTRYPOINT ["/coredns"]
CMD ["-conf", "/etc/coredns/Corefile"]