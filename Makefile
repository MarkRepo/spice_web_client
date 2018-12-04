include ../defines.mk

.PHONY: install
install:
	install -d ${WWWCLIENTDIR}
	cp -a * ${WWWCLIENTDIR}

.PHONY: distclean
distclean: clean
	
